import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEmployeeItemStatuses } from "@/lib/sheets";

// Live data straight from Google Sheets - never cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Any signed-in user: per-newcomer, per-product received status for the
// "ฐานข้อมูลพนักงานใหม่" table.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await getEmployeeItemStatuses();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;