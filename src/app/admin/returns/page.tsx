"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { MobileField } from "@/components/MobileField";
import type { RequisitionLog } from "@/types";
import { formatDate, formatNumber } from "@/lib/utils";
import { HopLoader } from "@/components/HopLoader";
import { CheckCircle2, Clock, RotateCcw, RefreshCw } from "lucide-react";

type FilterKey = "all" | "not_returned" | "partial" | "returned";

function returnState(log: RequisitionLog): FilterKey {
  const remaining = log.quantityRequested - (log.returnedQuantity || 0);
  if (remaining <= 0 && (log.returnedQuantity || 0) > 0) return "returned";
  if ((log.returnedQuantity || 0) > 0 && remaining > 0) return "partial";
  return "not_returned";
}

const BADGE: Record<FilterKey, { label: string; cls: string; icon: React.ReactNode }> = {
  all: { label: "", cls: "", icon: null },
  not_returned: {
    label: "ยังไม่คืน",
    cls: "bg-slate-100 text-slate-600",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  partial: {
    label: "คืนบางส่วน",
    cls: "bg-amber-100 text-amber-700",
    icon: <RotateCcw className="w-3.5 h-3.5" />,
  },
  returned: {
    label: "คืนครบแล้ว",
    cls: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
};

export default function AdminReturnsPage() {
  const [logs, setLogs] = useState<RequisitionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch("/api/requisitions", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data.filter((l: RequisitionLog) => l.status === "SUCCESS" && !l.isOnboarding && !l.isActivity) : []))
      .catch((e) => {
        if (e?.name !== "AbortError") setLogs([]);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [reloadKey]);

  // Pick up returns processed in another tab/session while this page is
  // sitting open (e.g. staff returns something, then admin tabs back in).
  useEffect(() => {
    function onFocus() {
      setReloadKey((k) => k + 1);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const counts = useMemo(() => {
    const c = { not_returned: 0, partial: 0, returned: 0 };
    for (const l of logs) c[returnState(l) as "not_returned" | "partial" | "returned"]++;
    return c;
  }, [logs]);

  const filtered = useMemo(() => {
    let list = logs;
    if (filter !== "all") list = list.filter((l) => returnState(l) === filter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (l) => l.userName.toLowerCase().includes(s) || l.productName.toLowerCase().includes(s) || l.eventName.toLowerCase().includes(s) || (l.note || "").toLowerCase().includes(s)
      );
    }
    return [...list].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }, [logs, filter, q]);

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">ประวัติการคืนสินค้า</h1>
        <p className="text-sm text-slate-500 mb-4">
          ดูว่าใครเบิกของชิ้นไหนไปแล้ว คืนแล้วหรือยัง
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {(["all", "not_returned", "partial", "returned"] as FilterKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-2 md:py-1.5 rounded-full text-xs font-medium border transition ${
                filter === k
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {k === "all" ? `ทั้งหมด (${logs.length})` : `${BADGE[k].label} (${counts[k]})`}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อคน / สินค้า / งาน / เหตุผล"
            className="order-last md:order-none w-full md:w-56 md:ml-auto h-11 md:h-auto border border-slate-200 rounded-full px-4 md:px-3 md:py-1.5 text-sm bg-white"
          />
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-full text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            title="รีเฟรชข้อมูลล่าสุด"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            รีเฟรช
          </button>
        </div>

        {loading ? (
          <HopLoader />
        ) : filtered.length === 0 ? (
          <p className="text-slate-400 text-sm">ไม่พบรายการ</p>
        ) : (
          <>
            {/* Mobile: one card per withdrawal */}
            <div className="md:hidden space-y-3">
              {filtered.map((l) => {
                const badge = BADGE[returnState(l)];
                return (
                  <div key={l.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 leading-snug break-words">
                          {l.isOnboarding ? l.employeeName || l.userName : l.userName}
                        </p>
                        <p className="text-sm text-slate-600 mt-0.5 break-words">{l.productName}</p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${badge.cls}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-400">เบิกไป</p>
                        <p className="text-lg font-bold text-slate-800 leading-tight">{formatNumber(l.quantityRequested)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-400">คืนแล้ว</p>
                        <p className="text-lg font-bold text-slate-800 leading-tight">{formatNumber(l.returnedQuantity || 0)}</p>
                      </div>
                    </div>
                    <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-2.5">
                      <MobileField label="งาน" className="col-span-2">
                        {l.isOnboarding ? "ชุดพนักงานใหม่" : l.eventName || "—"}
                      </MobileField>
                      <MobileField label="เหตุผล" className="col-span-2">{l.note || "—"}</MobileField>
                      <MobileField label="วันที่เบิก">{formatDate(l.createdAt)}</MobileField>
                      <MobileField label="วันที่คืนล่าสุด">{l.returnedAt ? formatDate(l.returnedAt) : "—"}</MobileField>
                    </dl>
                  </div>
                );
              })}
            </div>

          <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                  <th className="px-4 py-3 font-medium">ผู้เบิก</th>
                  <th className="px-4 py-3 font-medium">สินค้า</th>
                  <th className="px-4 py-3 font-medium text-right">เบิกไป</th>
                  <th className="px-4 py-3 font-medium text-right">คืนแล้ว</th>
                  <th className="px-4 py-3 font-medium">งาน</th>
                  <th className="px-4 py-3 font-medium">เหตุผล</th>
                  <th className="px-4 py-3 font-medium">วันที่เบิก</th>
                  <th className="px-4 py-3 font-medium">วันที่คืนล่าสุด</th>
                  <th className="px-4 py-3 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((l) => {
                  const state = returnState(l);
                  const badge = BADGE[state];
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {l.isOnboarding ? l.employeeName || l.userName : l.userName}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{l.productName}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatNumber(l.quantityRequested)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatNumber(l.returnedQuantity || 0)}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">
                        {l.isOnboarding ? "ชุดพนักงานใหม่" : l.eventName || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate" title={l.note || undefined}>
                        {l.note || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(l.createdAt)}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {l.returnedAt ? formatDate(l.returnedAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${badge.cls}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </main>
    </div>
  );
}