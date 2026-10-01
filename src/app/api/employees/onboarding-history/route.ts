import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOnboardingHistory } from "@/lib/sheets";
import type { SessionUser } from "@/types";

// Admin2-only: ประวัติการเบิกของพนักงานใหม่ — who claimed (ชื่อผู้เบิก) for
// which newcomer, joined with that newcomer's roster info.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = session.user as SessionUser;
  if (actor.role !== "Admin2") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let history = await getOnboardingHistory();
    if (from) history = history.filter((h) => h.startDate && h.startDate >= from);
    if (to) history = history.filter((h) => h.startDate && h.startDate <= to);

    return NextResponse.json(history);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;