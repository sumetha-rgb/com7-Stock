"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import type { RequisitionLog } from "@/types";
import { formatDate, formatNumber } from "@/lib/utils";
import { HopLoader } from "@/components/HopLoader";
import { CalendarDays, CheckCircle2, Clock3, Package, Search, XCircle } from "lucide-react";

export default function HistoryPage() {
  const [logs, setLogs] = useState<RequisitionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [type, setType] = useState("all");
  const [returnStatus, setReturnStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    fetch("/api/requisitions?mine=true")
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");
    return logs.filter((log) => {
      const date = new Date(log.createdAt);
      const logMonth = Number.isNaN(date.getTime())
        ? ""
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const logType = log.isOnboarding ? "onboarding" : log.isActivity ? "activity" : "general";
      const isReturnable = !log.isActivity && !log.isOnboarding && log.status === "SUCCESS";
      const returnedQuantity = log.returnedQuantity || 0;
      const isReturned = isReturnable && returnedQuantity >= log.quantityRequested;
      const matchesReturnStatus = returnStatus === "all"
        || (returnStatus === "returned" && isReturned)
        || (returnStatus === "not-returned" && isReturnable && !isReturned);
      const matchesSearch = !query || [log.productName, log.eventName, log.employeeName, log.note]
        .some((value) => value?.toLocaleLowerCase("th-TH").includes(query));
      return logMonth === month && (type === "all" || logType === type) && matchesReturnStatus && matchesSearch;
    });
  }, [logs, month, type, returnStatus, search]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const visibleLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);
  const successfulCount = logs.filter((log) => log.status === "SUCCESS").length;
  const totalRequested = logs
    .filter((log) => log.status === "SUCCESS")
    .reduce((sum, log) => sum + log.quantityRequested, 0);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((pageNumber) => pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - page) <= 1);

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        <div className="mb-6">
          <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">My stock activity</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mt-1">ประวัติการเบิกของฉัน</h1>
          <p className="text-sm text-slate-500 mt-1">ตรวจสอบรายการเบิกและค้นหาประวัติย้อนหลังได้ที่นี่</p>
        </div>
        {loading ? (
          <HopLoader />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> เบิกสำเร็จ</div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{formatNumber(successfulCount)} <span className="text-sm font-medium text-slate-400">ครั้ง</span></p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Package className="w-4 h-4 text-sky-600" /> จำนวนชิ้นที่เบิกสำเร็จ</div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{formatNumber(totalRequested)} <span className="text-sm font-medium text-slate-400">ชิ้น</span></p>
              </div>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-bold text-slate-900">รายการเบิก</h2>
                </div>
                <p className="mt-1 text-xs text-slate-500">เลือกเดือนและประเภท เพื่อดูประวัติได้ง่ายขึ้น</p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <label>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">เดือน</span>
                    <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">ประเภทการเบิก</span>
                    <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                      <option value="all">ทุกประเภท</option>
                      <option value="general">เบิกทั่วไป</option>
                      <option value="activity">เบิกสำหรับกิจกรรม</option>
                      <option value="onboarding">ชุดพนักงานใหม่</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">สถานะการคืนสินค้า</span>
                    <select value={returnStatus} onChange={(event) => { setReturnStatus(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                      <option value="all">ทุกสถานะ</option>
                      <option value="returned">คืนครบแล้ว</option>
                      <option value="not-returned">ยังคืนไม่ครบ</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">ค้นหาสินค้าหรือกิจกรรม</span>
                    <span className="relative block">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="เช่น เสื้อ Polo, Job Fair" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                    </span>
                  </label>
                </div>
              </div>

              {logs.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Package className="h-6 w-6" /></span>
                  <p className="mt-3 font-semibold text-slate-700">ยังไม่มีประวัติการเบิก</p>
                  <p className="mt-1 text-sm text-slate-400">เมื่อมีรายการเบิก รายการจะแสดงที่หน้านี้</p>
                </div>
              ) : visibleLogs.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="font-semibold text-slate-700">ไม่พบรายการในเดือนนี้</p>
                  <p className="mt-1 text-sm text-slate-400">ลองเปลี่ยนเดือน ประเภท หรือคำค้นหา</p>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-slate-100 px-4 sm:px-5">
                    {visibleLogs.map((log) => {
                      const success = log.status === "SUCCESS";
                      const failed = log.status === "FAILED";
                      const label = log.isOnboarding ? "ชุดพนักงานใหม่" : log.isActivity ? "กิจกรรม" : "เบิกทั่วไป";
                      const badgeStyle = log.isOnboarding
                        ? "bg-violet-50 text-violet-700 ring-violet-100"
                        : log.isActivity
                        ? "bg-orange-50 text-orange-700 ring-orange-100"
                        : "bg-sky-50 text-sky-700 ring-sky-100";
                      return (
                        <li key={log.id} className="flex gap-3 py-4 sm:gap-4">
                          <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${success ? "bg-emerald-50 text-emerald-600" : failed ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                            {success ? <CheckCircle2 className="h-5 w-5" /> : failed ? <XCircle className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <h3 className="font-bold text-slate-900">{log.productName}</h3>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">×{formatNumber(log.quantityRequested)}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">{log.eventName || "ไม่ได้ระบุชื่อกิจกรรม"}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${badgeStyle}`}>{label}{log.isActivity && log.employeeName ? ` · ผู้รับ ${log.employeeName}` : log.isOnboarding && log.employeeName ? ` · ${log.employeeName}` : ""}</span>
                              {!log.isActivity && !log.isOnboarding && log.status === "SUCCESS" && (
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${(log.returnedQuantity || 0) >= log.quantityRequested ? "bg-teal-50 text-teal-700 ring-teal-100" : "bg-orange-50 text-orange-700 ring-orange-100"}`}>
                                  {(log.returnedQuantity || 0) >= log.quantityRequested
                                    ? `คืนครบแล้ว ${formatNumber(log.returnedQuantity || 0)}/${formatNumber(log.quantityRequested)}`
                                    : (log.returnedQuantity || 0) === 0
                                    ? "ยังไม่ได้คืนสินค้า"
                                    : `คืนบางส่วน ${formatNumber(log.returnedQuantity || 0)}/${formatNumber(log.quantityRequested)}`}
                                </span>
                              )}
                            </div>
                            {log.note && <p className="mt-2 text-xs text-slate-500"><span className="font-semibold">หมายเหตุ:</span> {log.note}</p>}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${success ? "text-emerald-700" : failed ? "text-red-600" : "text-amber-700"}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${success ? "bg-emerald-500" : failed ? "bg-red-500" : "bg-amber-500"}`} />
                              {success ? "สำเร็จ" : failed ? "ไม่สำเร็จ" : "บางส่วน"}
                            </span>
                            <p className="mt-1 text-xs text-slate-400">{formatDate(log.createdAt)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <p className="text-xs text-slate-400">แสดง {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredLogs.length)} จาก {formatNumber(filteredLogs.length)} รายการ</p>
                    {filteredLogs.length > pageSize && (
                      <div className="flex items-center gap-1 self-end sm:self-auto">
                        <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">ก่อนหน้า</button>
                        {pageNumbers.map((pageNumber, index) => (
                          <span key={pageNumber} className="contents">
                            {index > 0 && pageNumbers[index - 1] !== pageNumber - 1 && <span className="px-1 text-slate-400">…</span>}
                            <button type="button" onClick={() => setPage(pageNumber)} aria-current={page === pageNumber ? "page" : undefined} className={`h-8 w-8 rounded-lg border text-xs font-semibold ${page === pageNumber ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{pageNumber}</button>
                          </span>
                        ))}
                        <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">ถัดไป</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
