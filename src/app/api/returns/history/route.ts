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

  try {
    // Every role (Staff, Admin, Admin2) only ever sees their own return
    // history — never other people's.
    const history = await getReturnHistory({ userId: user.id });
    return NextResponse.json(history, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "ไม่สามารถโหลดประวัติการคืนของได้ กรุณาลองใหม่" }, { status: 500 });
  }
}