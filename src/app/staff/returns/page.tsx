"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import type { Product, RequisitionLog } from "@/types";
import { formatDate, formatNumber } from "@/lib/utils";
import { HopLoader } from "@/components/HopLoader";
import { RotateCcw, CheckCircle2, X, AlertTriangle, History, Package, Search, CalendarDays } from "lucide-react";
import Link from "next/link";

export default function StaffReturnsPage() {
  const [logs, setLogs] = useState<RequisitionLog[]>([]);
  const [productUnits, setProductUnits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ log: RequisitionLog; qty: number } | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 5;

  function load() {
    setLoading(true);
    fetch("/api/requisitions?mine=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: Product[]) => {
        if (Array.isArray(data)) setProductUnits(Object.fromEntries(data.map((product) => [product.id, product.unit])));
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  // Only successful, non-onboarding requisitions can still have units
  // outstanding to return. Onboarding kits (ชุดพนักงานใหม่) are excluded on
  // purpose — those are managed from the ฐานข้อมูลพนักงานใหม่ flow, not
  // returned here. Once a requisition is fully returned it drops off this
  // list entirely — see /staff/returns/history for a full log.
  const returnable = useMemo(
    () =>
      logs
        .filter(
          (l) =>
            l.status === "SUCCESS" &&
            !l.isOnboarding &&
            !l.isActivity &&
            l.quantityRequested - (l.returnedQuantity || 0) > 0
        )
        .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)),
    [logs]
  );

  const filteredReturnable = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");
    return returnable.filter((log) => {
      const date = new Date(log.createdAt);
      const logMonth = Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const matchesSearch = !query || [log.productName, log.eventName, log.note]
        .some((value) => value?.toLocaleLowerCase("th-TH").includes(query));
      return logMonth === month && matchesSearch;
    });
  }, [returnable, month, search]);
  const totalPages = Math.max(1, Math.ceil(filteredReturnable.length / pageSize));
  const visibleReturnable = filteredReturnable.slice((page - 1) * pageSize, page * pageSize);
  const remainingTotal = returnable.reduce((sum, log) => sum + log.quantityRequested - (log.returnedQuantity || 0), 0);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  function requestReturn(log: RequisitionLog) {
    const remaining = log.quantityRequested - (log.returnedQuantity || 0);
    const raw = qtyInputs[log.id];
    const qty = raw ? Number(raw) : remaining;
    setError(null);
    if (!Number.isFinite(qty) || qty <= 0 || qty > remaining) {
      setError(`จำนวนที่คืนต้องอยู่ระหว่าง 1 ถึง ${remaining}`);
      return;
    }
    setConfirmTarget({ log, qty });
  }

  async function confirmReturn() {
    if (!confirmTarget) return;
    const { log, qty } = confirmTarget;
    setError(null);
    setOkMsg(null);
    setSubmittingId(log.id);
    try {
      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "return", logId: log.id, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "คืนของไม่สำเร็จ กรุณาลองใหม่");
      } else {
        setOkMsg(`คืน ${log.productName} จำนวน ${qty} ${data.product?.unit || ""} เรียบร้อยแล้ว`);
        load();
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    } finally {
      setSubmittingId(null);
      setConfirmTarget(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6 md:py-8">
          <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">Stock returns</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mt-1">คืนของที่เบิกไป</h1>
          </div>
          <Link
            href="/staff/returns/history"
            className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-sm font-semibold transition"
          >
            <History className="w-3.5 h-3.5" />
            ประวัติคืนสินค้า
          </Link>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          เลือกรายการที่เบิกไปแล้วต้องการคืนกลับเข้าคลัง สามารถคืนบางส่วนได้
        </p>

        {error && (
          <div className="mb-3 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {okMsg && (
          <div className="mb-3 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {okMsg}
          </div>
        )}

        {loading ? (
          <HopLoader />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Package className="h-4 w-4 text-emerald-600" /> รายการที่คืนได้ทั้งหมด</div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{formatNumber(returnable.length)} <span className="text-sm font-medium text-slate-400">รายการ</span></p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><RotateCcw className="h-4 w-4 text-sky-600" /> จำนวนที่ยังคืนได้ทั้งหมด</div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{formatNumber(remainingTotal)} <span className="text-sm font-medium text-slate-400">หน่วยรวม</span></p>
              </div>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-emerald-600" /><h2 className="font-bold text-slate-900">รายการที่ยังคืนได้</h2></div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">เดือนที่เบิก</span>
                    <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">ค้นหาสินค้าหรือกิจกรรม</span>
                    <span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="เช่น เสื้อ Polo, Job Fair" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" /></span>
                  </label>
                </div>
                <p className="mt-3 text-xs text-slate-400">พบ {formatNumber(filteredReturnable.length)} รายการในเดือนที่เลือก · คืนได้บางส่วนหรือทั้งหมด</p>
              </div>

              {returnable.length === 0 ? (
                <div className="px-5 py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-500"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-3 font-semibold text-slate-700">ไม่มีของที่สามารถคืนได้</p><p className="mt-1 text-sm text-slate-400">รายการที่คืนครบแล้วจะแสดงในประวัติคืนของ</p></div>
              ) : visibleReturnable.length === 0 ? (
                <div className="px-5 py-12 text-center"><p className="font-semibold text-slate-700">ไม่พบรายการในเงื่อนไขนี้</p><p className="mt-1 text-sm text-slate-400">ลองเปลี่ยนเดือนหรือคำค้นหา</p></div>
              ) : (
                <>
                  <ul className="divide-y divide-slate-100 px-4 sm:px-5">
                    {visibleReturnable.map((log) => {
              const remaining = log.quantityRequested - (log.returnedQuantity || 0);
              const partiallyReturned = (log.returnedQuantity || 0) > 0;
              return (
                <li key={log.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Package className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{log.productName} <span className="font-medium text-slate-500">เบิกไป {formatNumber(log.quantityRequested)}</span></p>
                      <p className="mt-1 truncate text-sm text-slate-600">งาน: {log.eventName || "ไม่ระบุ"}</p>
                      {log.note && <p className="mt-1 truncate text-xs text-slate-500">หมายเหตุ: {log.note}</p>}
                      <p className="mt-1 text-xs text-slate-400">{formatDate(log.createdAt)}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${partiallyReturned ? "bg-amber-50 text-amber-700" : "bg-orange-50 text-orange-700"}`}>{partiallyReturned ? `คืนแล้ว ${formatNumber(log.returnedQuantity)} · คงเหลือที่ต้องคืน ${formatNumber(remaining)} ${productUnits[log.productId] || "หน่วย"}` : `คงเหลือที่ต้องคืน ${formatNumber(remaining)} ${productUnits[log.productId] || "หน่วย"}`}</span>
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 items-center gap-2 pl-[52px] sm:w-auto sm:pl-0">
                    <label className="sr-only" htmlFor={`return-qty-${log.id}`}>จำนวนที่ต้องการคืน</label>
                    <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-white focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 sm:w-28 sm:flex-none">
                      <input id={`return-qty-${log.id}`} type="number" min={1} max={remaining} placeholder={String(remaining)} value={qtyInputs[log.id] ?? ""} onChange={(e) => setQtyInputs((prev) => ({ ...prev, [log.id]: e.target.value }))} className="h-full min-w-0 flex-1 rounded-l-xl bg-transparent px-2 text-right text-sm outline-none" />
                      <span className="pr-2 text-xs text-slate-400">{productUnits[log.productId] || "หน่วย"}</span>
                    </div>
                    <button onClick={() => requestReturn(log)} disabled={submittingId === log.id} className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:px-4"><RotateCcw className="h-4 w-4" />{submittingId === log.id ? "กำลังคืน..." : "คืนของ"}</button>
                  </div>
                </li>
              );
            })}
                  </ul>
                  {filteredReturnable.length > pageSize && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-5"><span className="text-xs text-slate-400">แสดง {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredReturnable.length)} จาก {formatNumber(filteredReturnable.length)} รายการ</span><div className="flex gap-2"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 disabled:opacity-40">ก่อนหน้า</button><span className="self-center text-xs text-slate-500">{page}/{totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 disabled:opacity-40">ถัดไป</button></div></div>}
                </>
              )}
            </section>
          </div>
        )}
      </main>

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">ยืนยันการคืนของ</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  คืน <span className="font-medium text-slate-700">{confirmTarget.log.productName}</span> จำนวน{" "}
                  <span className="font-medium text-slate-700">{formatNumber(confirmTarget.qty)}</span> ชิ้น
                  กลับเข้าคลังใช่หรือไม่?
                </p>
              </div>
              <button
                onClick={() => setConfirmTarget(null)}
                className="ml-auto text-slate-400 hover:text-slate-600"
                aria-label="ปิด"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmReturn}
                disabled={submittingId === confirmTarget.log.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {submittingId === confirmTarget.log.id ? "กำลังคืน..." : "ยืนยันคืนของ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
