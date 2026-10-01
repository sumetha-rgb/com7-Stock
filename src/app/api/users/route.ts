import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUsers, getUserById, updateUser, deleteUser, deleteEmployeeByEmployeeId, appendAuditLog } from "@/lib/sheets";
import type { SessionUser, Role, UserStatus } from "@/types";
import { notifyNewUser } from "@/lib/notifications";
import { runInBackground } from "@/lib/background";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as SessionUser;
  if (user.role !== "Admin2") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const users = await getUsers();
    // Strip passwords
    return NextResponse.json(
      users.map(({ password, ...rest }) => rest)
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const allowed: Partial<{
      name: string;
      email: string;
      username: string;
      password: string;
      role: Role;
      status: UserStatus;
    }> = {};
    if (updates.name) allowed.name = updates.name;
    if (updates.email) allowed.email = updates.email;
    if (updates.username) allowed.username = updates.username;
    if (updates.password) allowed.password = updates.password;
    if (updates.role) allowed.role = updates.role;
    if (updates.status) allowed.status = updates.status;

    const before = await getUserById(id);
    const updated = await updateUser(id, allowed);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      action: "UPDATE_USER",
      targetUserId: id,
      // Log only the fields that actually changed (from → to) and NEVER
      // store the password itself in the audit log.
      detail: JSON.stringify(
        Object.fromEntries(
          Object.entries(allowed)
            .filter(([k, v]) => k === "password" || (before as Record<string, unknown> | null)?.[k] !== v)
            .map(([k, v]) =>
              k === "password"
                ? [k, { changed: true, to: "(hidden)" }]
                : [k, { from: (before as Record<string, unknown> | null)?.[k] ?? "", to: v }]
            )
        )
      ),
    });

    if (updates.password) {
      // Re-send credentials
      runInBackground(() =>
        notifyNewUser({
        name: updated.name,
        username: updated.username,
        password: updates.password,
        email: updated.email,
        role: updated.role,
        })
      );
    }

    const { password, ...safe } = updated;
    return NextResponse.json(safe);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = session.user as SessionUser;
  if (actor.role !== "Admin2") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (id === actor.id) {
      return NextResponse.json({ error: "ไม่สามารถลบบัญชีของตัวเองได้" }, { status: 400 });
    }

    const target = await getUserById(id);
    const removed = await deleteUser(id);
    if (!removed) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // A user and their "new hire" record are the same person (linked by
    // employeeId), so deleting the user must also clear them from the
    // "พนักงานใหม่" list — otherwise they'd keep showing there as a stale
    // leftover row even though their account no longer exists.
    if (target?.employeeId) {
      await deleteEmployeeByEmployeeId(target.employeeId);
    }

    await appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      action: "DELETE_USER",
      targetUserId: id,
      detail: target ? `Deleted user ${target.username} (employeeId: ${target.employeeId || "-"})` : id,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;