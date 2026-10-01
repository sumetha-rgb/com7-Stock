import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEventCategories } from "@/lib/sheets";

// Event categories for the requisition dropdown, read from the "Config"
// Google Sheet (column "Event"). Any signed-in user may read them.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const categories = await getEventCategories();
    return NextResponse.json({ categories }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Event categories error:", e);
    return NextResponse.json(
      { error: "โหลดหมวดหมู่ Event ไม่สำเร็จ (ตรวจสอบว่าแชร์ชีท Config ให้ Service Account แล้ว)" },
      { status: 500 }
    );
  }
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;