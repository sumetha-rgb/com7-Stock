import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { importNewcomersFromSheet } from "@/lib/sheets";
import type { SessionUser } from "@/types";

// ซิงค์ "Data Newcomer" จากลิงก์ที่ตั้งไว้ใน env (NEWCOMER_SHEET_URL) โดยไม่ต้องวางลิงก์ใหม่
//  - Vercel Cron เรียกเป็นระยะ (ส่ง Authorization: Bearer $CRON_SECRET มาให้เอง)
//  - หน้า "ฐานข้อมูลพนักงานใหม่" เรียกตอนเปิดหน้า (Admin2) — มี throttle กันยิงรัวๆ
// middleware ปล่อยเส้นทางนี้ผ่านเพราะตรวจสิทธิ์เองที่นี่

const MIN_INTERVAL_MS = 60_000;
let lastRun = 0;
let lastResult: { imported: number; at: string } | null = null;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`;

  if (!isCron) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as SessionUser).role !== "Admin2") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const sheetUrl = process.env.NEWCOMER_SHEET_URL?.trim();
  if (!sheetUrl) return NextResponse.json({ configured: false });

  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!isCron && !force && lastResult && Date.now() - lastRun < MIN_INTERVAL_MS) {
    return NextResponse.json({ configured: true, skipped: true, ...lastResult });
  }

  try {
    const r = await importNewcomersFromSheet(sheetUrl);
    lastRun = Date.now();
    lastResult = { imported: r.imported, at: new Date().toISOString() };
    return NextResponse.json({ configured: true, skipped: false, ...lastResult });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "ซิงค์ไม่สำเร็จ";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}

export const maxDuration = 30;