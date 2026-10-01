import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { importNewcomersFromSheet, appendAuditLog } from "@/lib/sheets";
import type { SessionUser } from "@/types";

// Admin2 pastes a Google Sheet link on "ฐานข้อมูลพนักงานใหม่"; we fetch it,
// reformat it as CSV, and sync it into our own "Data Newcomer" sheet, which
// is what the พนักงานใหม่ page and the onboarding requisition flow read from.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = session.user as SessionUser;
  if (actor.role !== "Admin2") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const sheetUrl: string = (body?.sheetUrl || "").trim();
    if (!sheetUrl) {
      return NextResponse.json({ error: "กรุณาวางลิงก์ Google Sheet" }, { status: 400 });
    }

    const result = await importNewcomersFromSheet(sheetUrl);

    await appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      action: "IMPORT_NEWCOMERS",
      targetUserId: "",
      detail: `Synced ${result.imported} newcomer row(s) from linked Google Sheet`,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "ดึงข้อมูลไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;