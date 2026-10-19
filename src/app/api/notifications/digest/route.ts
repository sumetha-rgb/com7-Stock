import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Mutex } from "async-mutex";
import { authOptions } from "@/lib/auth";
import { getBatchNotifications, markBatchesSent } from "@/lib/sheets";
import { buildBatchDigest, countDigestGroups, getDigestAudience, sendBatchDigest } from "@/lib/notifications";
import type { BatchKind, BatchNotification, SessionUser } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KINDS: BatchKind[] = ["onboarding", "activity"];

// One send at a time per server instance, so a double click (or the cron firing
// at the same moment as the button) can't announce the same batches twice.
const sendLock = new Mutex();

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

// Any logged-in user (Staff, Admin, Admin2) may preview / press send. Double
// sends are prevented by the PENDING -> SENT status + sendLock below.
async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session.user as SessionUser;
}

function summarize(batches: BatchNotification[]) {
  return {
    pending: batches.length, // queued submissions
    groups: countDigestGroups(batches), // what the admin sees: groups of people with the same items
    people: batches.reduce((n, b) => n + b.people.length, 0),
  };
}

// GET
//  - Vercel Cron (Bearer CRON_SECRET): send every kind's pending batches, once.
//  - Logged-in user, no params:         status of both buttons.
//  - Logged-in user, ?kind=...&preview=1: exactly what would be sent (email + LINE).
export async function GET(req: NextRequest) {
  if (isCronRequest(req)) {
    return sendLock.runExclusive(async () => {
      const results: Record<string, unknown> = {};
      for (const kind of KINDS) {
        try {
          const pending = await getBatchNotifications({ kind, status: "PENDING" });
          if (pending.length === 0) {
            results[kind] = { skipped: true }; // nothing to announce -> stay silent
            continue;
          }
          const r = await sendBatchDigest(kind, pending);
          if (r.email === true || r.line === true) {
            await markBatchesSent(pending.map((b) => b.id), "อัตโนมัติ 09:00");
            results[kind] = { sent: pending.length, ...r };
          } else {
            results[kind] = { sent: 0, failed: true, ...r }; // left PENDING -> retried next run / button
          }
        } catch (e) {
          console.error(`digest cron (${kind}) failed:`, e);
          results[kind] = { error: true };
        }
      }
      return NextResponse.json({ ok: true, results });
    });
  }

  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const kindParam = req.nextUrl.searchParams.get("kind");
    const all = await getBatchNotifications();

    if (kindParam && req.nextUrl.searchParams.get("preview") === "1") {
      if (!KINDS.includes(kindParam as BatchKind)) {
        return NextResponse.json({ error: "kind ไม่ถูกต้อง" }, { status: 400 });
      }
      const kind = kindParam as BatchKind;
      const pending = all.filter((b) => b.kind === kind && b.status === "PENDING");
      if (pending.length === 0) return NextResponse.json({ kind, pending: 0, batchIds: [], preview: null });
      const content = buildBatchDigest(kind, pending);
      const audience = await getDigestAudience();
      return NextResponse.json({
        kind,
        ...summarize(pending),
        batchIds: pending.map((b) => b.id),
        audience,
        preview: { subject: content.subject, html: content.html, flex: content.flex, altText: content.altText },
      });
    }

    const status: Record<string, unknown> = {};
    for (const kind of KINDS) {
      const ofKind = all.filter((b) => b.kind === kind);
      const lastSent = ofKind
        .filter((b) => b.status === "SENT" && b.sentAt)
        .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))[0];
      status[kind] = {
        ...summarize(ofKind.filter((b) => b.status === "PENDING")),
        lastSentAt: lastSent?.sentAt || "",
        lastSentBy: lastSent?.sentBy || "",
      };
    }
    return NextResponse.json({ status });
  } catch (e) {
    console.error("digest GET failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

// POST { kind, batchIds } — a user pressed "ส่งสรุปตอนนี้" after looking at the
// preview. Only the batches that were shown in the preview are sent; anything
// queued while the dialog was open waits for the next round.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  let body: { kind?: string; batchIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!KINDS.includes(body.kind as BatchKind)) {
    return NextResponse.json({ error: "kind ไม่ถูกต้อง" }, { status: 400 });
  }
  const kind = body.kind as BatchKind;
  const wanted = new Set(Array.isArray(body.batchIds) ? body.batchIds.map(String) : []);

  return sendLock.runExclusive(async () => {
    try {
      const pending = (await getBatchNotifications({ kind, status: "PENDING" })).filter((b) => wanted.has(b.id));
      if (pending.length === 0) {
        return NextResponse.json({ error: "มีผู้ใช้อื่นกดส่งสรุปรายการนี้ไปแล้ว ระบบจึงไม่ส่งซ้ำ", alreadySent: true }, { status: 409 });
      }
      const r = await sendBatchDigest(kind, pending);
      if (r.email !== true && r.line !== true) {
        return NextResponse.json({ error: "ส่งไม่สำเร็จทั้งอีเมลและ LINE กรุณาตรวจสอบการตั้งค่า", ...r }, { status: 502 });
      }
      await markBatchesSent(pending.map((b) => b.id), admin.name);
      return NextResponse.json({ success: true, sent: pending.length, ...summarize(pending), ...r });
    } catch (e) {
      console.error("digest POST failed:", e);
      return NextResponse.json({ error: "ส่งสรุปไม่สำเร็จ" }, { status: 500 });
    }
  });
}