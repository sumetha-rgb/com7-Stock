"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import toast from "react-hot-toast";
import type { User, Role, UserStatus } from "@/types";
import { HopLoader } from "@/components/HopLoader";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";
import { Pencil, Trash2, X } from "lucide-react";

export default function Admin2UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    role: "Staff" as Role,
    employeeId: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Edit user
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    username: "",
    role: "Staff" as Role,
    status: "ACTIVE" as UserStatus,
    password: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete user
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  function nextEmployeeId(list: User[]): string {
    let maxNum = -1;
    list.forEach((u) => {
      const m = /^EMP-(\d+)$/i.exec(u.employeeId || "");
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    const next = maxNum + 1;
    return `EMP-${String(next).padStart(3, "0")}`;
  }

  function openForm() {
    setForm((f) => ({ ...f, employeeId: nextEmployeeId(users) }));
    setShowForm(true);
  }

  async function load() {
    // We need a users API - reuse employees for now or add one
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Re-fetch from the Sheet periodically so changes made directly in
    // Google Sheets (or by another admin) show up without a manual reload.
    // Paused while a form/modal is open so it never overwrites unsaved input.
    const interval = setInterval(() => {
      if (!showForm && !editUser && !deleteTarget) load();
    }, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("รหัสผ่านไม่ตรงกัน");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("สร้างผู้ใช้สำเร็จ (ส่งอีเมลแล้ว)");
        setShowForm(false);
        const refreshedUsers = await (async () => {
          const r = await fetch("/api/users");
          return r.ok ? ((await r.json()) as User[]) : users;
        })();
        setForm({
          name: "",
          email: "",
          username: "",
          password: "",
          confirmPassword: "",
          role: "Staff",
          employeeId: nextEmployeeId(refreshedUsers),
        });
        setUsers(refreshedUsers);
      } else {
        toast.error(data.error || "สร้างไม่สำเร็จ");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(u: User) {
    setEditUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      password: "",
    });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSavingEdit(true);
    try {
      const body: Record<string, string> = {
        id: editUser.id,
        name: editForm.name,
        email: editForm.email,
        username: editForm.username,
        role: editForm.role,
        status: editForm.status,
      };
      if (editForm.password.trim()) body.password = editForm.password.trim();

      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("บันทึกการแก้ไขสำเร็จ");
        setUsers((prev) => prev.map((u) => (u.id === editUser.id ? { ...u, ...data } : u)));
        setEditUser(null);
      } else {
        toast.error(data.error || "แก้ไขไม่สำเร็จ");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("ลบผู้ใช้สำเร็จ");
        setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        toast.error(data.error || "ลบไม่สำเร็จ");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-transparent md:pl-60">
      <PageTransitionOverlay
        show={submitting || savingEdit || deleting}
        variant="avatars"
        label="กำลังอัปเดตผู้ใช้งาน..."
      />
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">จัดการผู้ใช้งาน</h1>
          <button
            onClick={() => (showForm ? setShowForm(false) : openForm())}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium"
          >
            {showForm ? "ยกเลิก" : "+ เพิ่มผู้ใช้งาน"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="bg-white border rounded-xl p-5 mb-6 space-y-3 shadow-sm"
          >
            <h2 className="font-semibold">เพิ่มผู้ใช้งานใหม่</h2>
            <p className="text-xs text-slate-500 -mt-2">
              บัญชีนี้ใช้สำหรับทีมงาน/แอดมินเข้าสู่ระบบเท่านั้น จะไม่ถูกนำไปแสดงในหน้า
              &quot;พนักงานใหม่&quot; — รายชื่อพนักงานใหม่มาจาก
              ฐานข้อมูลพนักงานใหม่ (Google Sheet) เท่านั้น
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  ชื่อที่แสดงในระบบ
                </label>
                <input
                  required
                  placeholder="เช่น สมชาย ใจดี"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  อีเมล (ใช้ส่ง Username/Password ให้พนักงาน)
                </label>
                <input
                  required
                  type="email"
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  รหัสพนักงาน (สร้างให้อัตโนมัติ)
                </label>
                <input
                  readOnly
                  value={form.employeeId}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  Username สำหรับ Login (ตั้งเอง)
                </label>
                <input
                  required
                  placeholder="เช่น somchai.j"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  สิทธิ์การใช้งาน
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="Staff">Staff (พนักงานทั่วไป — เบิกของได้)</option>
                  <option value="Admin">Admin (จัดการสินค้า/สต็อก)</option>
                  <option value="Admin2">Admin2 (ผู้ดูแลระบบสูงสุด — จัดการผู้ใช้ได้)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  รหัสผ่านเริ่มต้น (พนักงานเปลี่ยนภายหลังได้)
                </label>
                <input
                  required
                  type="password"
                  placeholder="ตั้งรหัสผ่านให้พนักงาน"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  ยืนยันรหัสผ่านอีกครั้ง
                </label>
                <input
                  required
                  type="password"
                  placeholder="พิมพ์รหัสผ่านซ้ำให้ตรงกัน"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg text-sm"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <HopLoader />
        ) : (
          <div className="bg-white border rounded-xl divide-y shadow-sm">
            {users.map((u) => (
              <div key={u.id} className="px-4 py-3 flex justify-between items-center text-sm">
                <div>
                  <p className="font-medium">
                    {u.name}{" "}
                    <span className="text-slate-400">@{u.username}</span>
                  </p>
                  <p className="text-slate-500">
                    {u.email} · {u.employeeId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-slate-100 px-2 py-1 rounded">{u.role}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      u.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {u.status}
                  </span>
                  <button
                    onClick={() => openEdit(u)}
                    title="แก้ไข"
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-emerald-700"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(u)}
                    title="ลบ"
                    className="p-1.5 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {users.length === 0 && <p className="p-4 text-slate-400">ยังไม่มีผู้ใช้ หรือ API ยังไม่พร้อม</p>}
          </div>
        )}

        {/* Edit user modal */}
        {editUser && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
            onClick={() => !savingEdit && setEditUser(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-slate-800">แก้ไขผู้ใช้ ({editUser.username})</h3>
                <button
                  onClick={() => setEditUser(null)}
                  disabled={savingEdit}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSave} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">ชื่อที่แสดง</label>
                  <input
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">อีเมล</label>
                  <input
                    required
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Username</label>
                  <input
                    required
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">สิทธิ์การใช้งาน</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="Staff">Staff</option>
                      <option value="Admin">Admin</option>
                      <option value="Admin2">Admin2</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">สถานะ</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as UserStatus })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">
                    ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)
                  </label>
                  <input
                    type="password"
                    placeholder="รหัสผ่านใหม่"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => setEditUser(null)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-70"
                  >
                    {savingEdit ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        <ConfirmDialog
          open={!!deleteTarget}
          title={`ลบผู้ใช้ "${deleteTarget?.name ?? ""}"?`}
          description="การลบไม่สามารถย้อนกลับได้ ผู้ใช้นี้จะไม่สามารถเข้าสู่ระบบได้อีก"
          variant="danger"
          loading={deleting}
          loadingLabel="กำลังลบ..."
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      </main>
    </div>
  );
}