"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { formatDate, formatNumber } from "@/lib/utils";
import { HopLoader } from "@/components/HopLoader";
import { ArrowLeft, CalendarDays, Package, RotateCcw, Search } from "lucide-react";

interface ReturnHistoryEntry {
  id: string;
  createdAt: string;
  returnedBy: string;
  productName: string;
  quantity: number;
  unit: string;
  originalCreatedAt: string;
}

export default function StaffReturnHistoryPage() {
  const [items, setItems] = useState<ReturnHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    fetch("/api/returns/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");
    return [...items]
      .filter((item) => {
        const date = new Date(item.createdAt);
        const itemMonth = Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        return itemMonth === month && (!query || [item.productName, item.returnedBy].some((value) => value?.toLocaleLowerCase("th-TH").includes(query)));
      })
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }, [items, month, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalReturned = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        <Link href="/staff/returns" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> กลับไปหน้าคืนของ
        </Link>
        <div className="mb-6">
          <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">Return activity</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">ประวัติคืนของ</h1>
          <p className="mt-1 text-sm text-slate-500">ดูรายการและจำนวนของที่คืนกลับเข้าคลังแล้ว</p>
        </div>

        {loading ? (
          <HopLoader />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><RotateCcw className="h-4 w-4 text-emerald-600" /> คืนทั้งหมด</div><p className="mt-2 text-2xl font-extrabold text-slate-900">{formatNumber(items.length)} <span className="text-sm font-medium text-slate-400">ครั้ง</span></p></div>
              <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Package className="h-4 w-4 text-sky-600" /> จำนวนที่คืนเข้าคลัง</div><p className="mt-2 text-2xl font-extrabold text-slate-900">{formatNumber(totalReturned)} <span className="text-sm font-medium text-slate-400">ชิ้น</span></p></div>
            </div>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-emerald-600" /><h2 className="font-bold text-slate-900">รายการคืนสินค้า</h2></div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label><span className="mb-1 block text-[11px] font-semibold text-slate-500">เดือนที่คืน</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" /></label>
                  <label><span className="mb-1 block text-[11px] font-semibold text-slate-500">ค้นหาสินค้าหรือผู้คืน</span><span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="พิมพ์ชื่อสินค้า" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" /></span></label>
                </div>
                <p className="mt-3 text-xs text-slate-400">พบ {formatNumber(filtered.length)} รายการคืน</p>
              </div>
              {items.length === 0 ? (
                <div className="px-5 py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Package className="h-6 w-6" /></span><p className="mt-3 font-semibold text-slate-700">ยังไม่มีประวัติการคืนของ</p><p className="mt-1 text-sm text-slate-400">รายการคืนของสำเร็จจะแสดงที่นี่</p></div>
              ) : visible.length === 0 ? (
                <div className="px-5 py-12 text-center"><p className="font-semibold text-slate-700">ไม่พบรายการคืนในเดือนนี้</p><p className="mt-1 text-sm text-slate-400">ลองเปลี่ยนเดือนหรือคำค้นหา</p></div>
              ) : (
                <>
                  <ul className="divide-y divide-slate-100 px-4 sm:px-5">
                    {visible.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><RotateCcw className="h-5 w-5" /></div>
                          <div className="min-w-0"><p className="truncate font-bold text-slate-900">{item.productName}</p><p className="mt-1 text-xs text-slate-500">{item.returnedBy ? `ดำเนินการโดย ${item.returnedBy}` : "คืนสินค้าเข้าคลัง"}</p><p className="mt-1 text-xs text-slate-400 sm:hidden">{formatDate(item.createdAt)}</p></div>
                        </div>
                        <div className="shrink-0 text-right"><p className="font-bold text-emerald-700">+{formatNumber(item.quantity)} <span className="text-xs font-medium">{item.unit}</span></p><p className="mt-1 hidden text-xs text-slate-400 sm:block">{formatDate(item.createdAt)}</p><span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">คืนสำเร็จ</span></div>
                      </li>
                    ))}
                  </ul>
                  {filtered.length > pageSize && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-5"><span className="text-xs text-slate-400">แสดง {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} จาก {formatNumber(filtered.length)} รายการ</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 disabled:opacity-40">ก่อนหน้า</button><span className="text-xs text-slate-500">{page}/{totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 disabled:opacity-40">ถัดไป</button></div></div>}
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
