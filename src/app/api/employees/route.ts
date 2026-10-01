import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEmployees, createUser, appendAuditLog } from "@/lib/sheets";
import { notifyNewUser } from "@/lib/notifications";
import { runInBackground } from "@/lib/background";
import type { SessionUser } from "@/types";
import { v4 as uuidv4 } from "uuid";

// Returns the newcomer roster (จาก Data Newcomer sheet). Supports optional
// ?from=YYYY-MM-DD&to=YYYY-MM-DD to filter by วันที่เริ่มงาน (startDate) for
// the calendar-range filter on the "พนักงานใหม่" page.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let emps = await getEmployees();
    if (from) emps = emps.filter((e) => e.startDate && e.startDate >= from);
    if (to) emps = emps.filter((e) => e.startDate && e.startDate <= to);

    return NextResponse.json(emps);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}

// Create a login account only (Admin2). This intentionally does NOT create
// a "พนักงานใหม่" (newcomer) record anymore — that list is populated purely
// from the linked Google Sheet via /api/employees/import. A new account is
// for the admin team and should not show up in the newcomer roster.
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
    const { name, email, username, password, role, employeeId } = body;

    if (!name || !email || !username || !password || !employeeId) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }

    const userId = uuidv4();

    await createUser({
      id: userId,
      name,
      email,
      username,
      password, // plain as per spec (Admin2 sets it)
      role: role || "Staff",
      status: "ACTIVE",
      employeeId,
    });

    await appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      action: "CREATE_USER",
      targetUserId: userId,
      detail: `Created user ${username} role=${role}`,
    });

    // Send credentials email + LINE
    runInBackground(() =>
      notifyNewUser({
      name,
      username,
      password,
      email,
      role: role || "Staff",
      })
    );

    return NextResponse.json({ success: true, userId, employeeId });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "สร้างผู้ใช้ไม่สำเร็จ" }, { status: 500 });
  }
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;