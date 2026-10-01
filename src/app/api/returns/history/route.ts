import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getReturnHistory } from "@/lib/sheets";
import type { SessionUser } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as SessionUser;
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "true";

  try {
    // Staff can only ever see their own return history; Admin/Admin2 see
    // everyone's unless they explicitly ask for their own with ?mine=true.
    const history = await getReturnHistory(
      user.role === "Staff" ? { userId: user.id } : mine ? { userId: user.id } : undefined
    );
    return NextResponse.json(history, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "ไม่สามารถโหลดประวัติการคืนของได้ กรุณาลองใหม่" }, { status: 500 });
  }
}