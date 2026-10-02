"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import toast from "react-hot-toast";
import type { Employee, EmployeeItemStatusResult, OverallReceiveState } from "@/types";
import { HopLoader } from "@/components/HopLoader";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";
import { MobileField } from "@/components/MobileField";
import { Link2, RefreshCcw, CalendarRange, Search, Download } from "lucide-react";

// Columns shown in the table AND written to Excel / Google Sheet exports.
const COLUMNS: { key: keyof Employee; label: string; bold?: boolean }[] = [
  { key: "company", label: "บริษัท" },
  { key: "startDate", label: "วันที่เริ่มงาน" },
  { key: "employeeId", label: "รหัสพนักงาน" },
  { key: "fullName", label: "รายชื่อพนักงาน", bold: true },
  { key: "position", label: "ตำแหน่ง" },
  { key: "department", label: "หน่วยงาน" },
  { key: "cLevel", label: "C Level" },
];

// Formats an ISO timestamp as "d/m/yyyy" + "HH:mm" in Thailand time.
function formatDateTime(iso?: string): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("day")}/${g("month")}/${g("year")}`, time: `${g("hour")}:${g("minute")}` };
}

function StatusBadge({ state }: { state: OverallReceiveState }) {
  const ok = state === "COMPLETE";
  const label = ok ? "ได้รับแล้ว" : state === "PARTIAL" ? "ยังได้ไม่ครบ" : "ยังไม่ได้รับ";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${
        ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}

// canImport = true  -> Admin2: shows the paste-link + "ดึงข้อมูล" panel.
// canImport = false -> Staff / Admin: view + search + export only.
export function EmployeeDatabaseView({ canImport }: { canImport: boolean }) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [syncing, setSyncing] = useState(false);
  // true เมื่อ server ตั้ง NEWCOMER_SHEET_URL ไว้ → ซิงค์เองได้ ไม่ต้องวางลิงก์
  const [autoConfigured, setAutoConfigured] = useState(false);
  const [lastSyncedCount, setLastSyncedCount] = useState<number | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [itemStatus, setItemStatus] = useState<EmployeeItemStatusResult | null>(null);

  // Roster first: the table appears as soon as this returns.
  async function loadEmployees() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const qs = params.toString();
      const res = await fetch(`/api/employees${qs ? `?${qs}` : ""}`);
      if (res.ok) {
        const d = await res.json();
        setEmployees(Array.isArray(d) ? d : []);
      }
    } finally {
      setLoading(false);
    }
  }

  // Received-items / status load in the background (slower: reads the log
  // sheet). It doesn't depend on the date filter, so it isn't re-fetched then.
  async function loadItemStatus() {
    setItemsLoading(true);
    try {
      const r = await fetch("/api/employees/item-status", { cache: "no-store" });
      if (r.ok) setItemStatus(await r.json());
    } catch {
      /* table still works with the roster's own status */
    } finally {
      setItemsLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  useEffect(() => {
    loadItemStatus();
  }, []);

  // เปิดหน้านี้แล้วซิงค์จากลิงก์ที่ตั้งไว้ให้อัตโนมัติ (เงียบๆ ไม่ต้องกดอะไร)
  useEffect(() => {
    if (!canImport) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/employees/sync", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.configured) return;
        setAutoConfigured(true);
        if (!data.skipped) {
          setLastSyncedCount(data.imported);
          await Promise.all([loadEmployees(), loadItemStatus()]);
        }
      } catch {
        /* ซิงค์อัตโนมัติพลาด → ใช้ข้อมูลเดิมในระบบ ไม่รบกวนผู้ใช้ */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canImport]);

  async function handleSync(e: React.FormEvent) {
    e.preventDefault();
    // ไม่ได้วางลิงก์ + มีลิงก์ที่ตั้งไว้ใน server → ใช้ลิงก์นั้น
    const useSaved = !sheetUrl.trim() && autoConfigured;
    if (!sheetUrl.trim() && !useSaved) {
      toast.error("กรุณาวางลิงก์ Google Sheet ก่อน");
      return;
    }
    setSyncing(true);
    try {
      const res = useSaved
        ? await fetch("/api/employees/sync?force=1", { cache: "no-store" })
        : await fetch("/api/employees/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sheetUrl }),
          });
      const data = await res.json();
      if (res.ok) {
        toast.success(`ดึงข้อมูลสำเร็จ (${data.imported} รายการ)`);
        if (Array.isArray(data.missingOptional) && data.missingOptional.length) {
          // The pasted sheet/tab has no such column -> the table would show
          // auto-generated ids / "-". Say so instead of failing silently.
          toast.error(
            `ไม่พบคอลัมน์ "${data.missingOptional.join('", "')}" ในชีทที่วางลิงก์ (ตรวจว่าเป็นแท็บที่ถูกต้อง) คอลัมน์ที่พบ: ${(data.headers || []).join(", ")}`,
            { duration: 10000 }
          );
        }
        setLastSyncedCount(data.imported);
        await Promise.all([loadEmployees(), loadItemStatus()]);
      } else {
        toast.error(data.error || "ดึงข้อมูลไม่สำเร็จ");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setSyncing(false);
    }
  }

  // Search matches every column shown in the table (incl. รหัสพนักงาน and
  // C Level), newest start date first.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => !q || COLUMNS.some((c) => String(e[c.key] ?? "").toLowerCase().includes(q)))
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  }, [employees, search]);

  // Builds a CSV in the browser and downloads it (no extra package needed).
  // UTF-8 BOM is added so Excel shows Thai correctly; Google Sheets can open it too.
  // Layout: roster columns, then ONE COLUMN PER PRODUCT (1 = received, 0 = not),
  // then สถานะ.
  function exportFile() {
    if (!filtered.length) return toast.error("ไม่มีข้อมูลให้ Export");
    try {
      // Onboarding products first, then the กิจกรรม (activity) products at the very end.
      const productCols: { productId: string; productName: string; source: "ONBOARDING" | "ACTIVITY" }[] = [];
      const seen = new Set<string>();
      for (const source of ["ONBOARDING", "ACTIVITY"] as const) {
        for (const e of filtered) {
          for (const it of itemStatus?.employees[e.employeeId]?.selected || []) {
            if (it.source !== source) continue;
            const key = `${source}:${it.productId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            productCols.push({ productId: it.productId, productName: it.productName, source });
          }
        }
      }
      // If an activity product has the same name as an onboarding column, tag it
      // so the two header cells are not identical.
      const onbNames = new Set(productCols.filter((c) => c.source === "ONBOARDING").map((c) => c.productName));
      const colLabel = (c: { productName: string; source: string }) =>
        c.source === "ACTIVITY" && onbNames.has(c.productName) ? `${c.productName} (กิจกรรม)` : c.productName;
      // Order: roster columns (…C Level) > สถานะ > ชื่อคนเบิก > วันที่/เวลา > one column per product
      // (onboarding products, then activity products)
      const header = [
        ...COLUMNS.map((c) => c.label),
        "สถานะ",
        "ชื่อคนเบิก",
        "วันที่/เวลา",
        ...productCols.map(colLabel),
      ];
      const rows = filtered.map((e) => {
        const st = itemStatus?.employees[e.employeeId];
        const got = new Set(
          (st?.selected || []).filter((x) => x.received).map((x) => `${x.source}:${x.productId}`)
        );
        const overall = st?.hasOnboarding
          ? st.overall
          : e.status === "ONBOARDED"
          ? "COMPLETE"
          : "NONE";
        const dt = formatDateTime(st?.requestedAt);
        return [
          ...COLUMNS.map((c) => String(e[c.key] ?? "")),
          overall === "COMPLETE" ? "ได้รับแล้ว" : overall === "PARTIAL" ? "ยังได้ไม่ครบ" : "ยังไม่ได้รับ",
          st?.requestedBy ?? "",
          dt ? `${dt.date} ${dt.time}` : "",
          ...productCols.map((c) => (got.has(`${c.source}:${c.productId}`) ? 1 : 0)),
        ];
      });

      const cell = (v: string | number) => {
        let t = String(v);
        // stop spreadsheet formula injection (=, +, -, @ at the start of a text cell)
        if (typeof v === "string" && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
        return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      };
      const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ฐานข้อมูลพนักงานใหม่_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke later: revoking right after click() can cancel the download
      // (ERR_FILE_NOT_FOUND) because the browser reads the blob asynchronously.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`Export สำเร็จ (${filtered.length} รายการ)`);
    } catch {
      toast.error("Export ไม่สำเร็จ");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <PageTransitionOverlay show={syncing} label="กำลังดึงข้อมูลจาก Google Sheet..." />
      <Nav />
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">ฐานข้อมูลพนักงานใหม่</h1>

        {canImport ? (
          <>
            <p className="text-sm text-slate-500 mb-4">
              วางลิงก์ Google Sheet ที่มีชื่อชีท <span className="font-medium">&quot;Data Newcomer&quot;</span>{" "}
              ระบบจะดึงข้อมูลและนำไปแสดงในตารางด้านล่างให้อัตโนมัติ
              <br />
              คอลัมน์ที่ต้องมีในชีทต้นทาง: ลำดับ, บริษัท, เดือน, วันที่เริ่มงาน, รายชื่อพนักงาน,
              ตำแหน่ง, หน่วยงาน (ไม่บังคับ: รหัสพนักงาน, C Level) (ต้องแชร์แบบ &quot;ทุกคนที่มีลิงก์ดูได้&quot;)
            </p>

            {autoConfigured && (
              <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-3">
                🔄 ตั้งลิงก์ไว้แล้ว ระบบซิงค์ให้อัตโนมัติทุกครั้งที่เปิดหน้านี้ (และตามรอบเวลา) — ไม่ต้องวางลิงก์ใหม่
                กด &quot;ดึงข้อมูล&quot; ถ้าอยากอัปเดตทันที หรือวางลิงก์อื่นเพื่อใช้ชั่วคราว
              </p>
            )}

            <form
              onSubmit={handleSync}
              className="bg-white border rounded-xl p-4 mb-6 shadow-sm flex flex-col sm:flex-row gap-2"
            >
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder={autoConfigured ? "เว้นว่างไว้ = ใช้ลิงก์ที่ตั้งไว้" : "วางลิงก์ Google Sheet ที่นี่ (https://docs.google.com/spreadsheets/d/...)"}
                  className="w-full h-11 md:h-auto pl-9 pr-3 py-2 border rounded-lg text-sm bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={syncing}
                className="h-11 sm:h-auto px-4 sm:py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                <RefreshCcw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "กำลังดึงข้อมูล..." : "ดึงข้อมูล"}
              </button>
            </form>

            {lastSyncedCount !== null && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
                ซิงค์ล่าสุดสำเร็จ: {lastSyncedCount} รายการ
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 mb-4">
            รายชื่อพนักงานใหม่ในระบบ ค้นหาและ Export ข้อมูลได้
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาบริษัท / รหัสพนักงาน / ชื่อ / ตำแหน่ง / หน่วยงาน / C Level..."
              className="w-full h-11 md:h-auto pl-9 pr-3 py-2 border rounded-lg text-sm bg-white"
            />
          </div>
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 h-11 sm:h-auto sm:py-2 w-full sm:w-auto">
            <CalendarRange className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-sm outline-none flex-1 min-w-0 sm:flex-none"
              aria-label="ตั้งแต่วันที่เริ่มงาน"
            />
            <span className="text-slate-400 text-sm">ถึง</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-sm outline-none flex-1 min-w-0 sm:flex-none"
              aria-label="ถึงวันที่เริ่มงาน"
            />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                }}
                className="text-xs text-slate-400 hover:text-slate-600 ml-1"
              >
                ล้าง
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={exportFile}
            disabled={loading || itemsLoading}
            className="h-11 sm:h-auto px-4 sm:py-2 bg-white border rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-slate-50 disabled:opacity-50 shrink-0"
          >
            <Download className="w-4 h-4" />
            Export ข้อมูล
          </button>
        </div>

        <h2 className="text-sm font-semibold text-slate-600 mb-2">
          รายชื่อพนักงานใหม่ปัจจุบันในระบบ ({filtered.length})
        </h2>
        {loading ? (
          <HopLoader />
        ) : (
          <>
            {/* Mobile: one card per employee */}
            <div className="md:hidden space-y-3">
              {filtered.map((e) => {
                const st = itemStatus?.employees[e.employeeId];
                const pending = itemsLoading && !itemStatus;
                const state = st?.hasOnboarding ? st.overall : e.status === "ONBOARDED" ? "COMPLETE" : "NONE";
                const dt = formatDateTime(st?.requestedAt);
                return (
                  <div key={e.id} className="bg-white border rounded-xl shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 leading-snug break-words">
                          {String(e.fullName ?? "") || "-"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 break-words">
                          {String(e.position ?? "") || "-"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {pending ? (
                          <span className="inline-block h-6 w-20 rounded-full bg-slate-100 animate-pulse" />
                        ) : (
                          <>
                            <StatusBadge state={state} />
                            {dt && (
                              <p className="mt-1 text-[11px] text-slate-500 leading-tight">
                                {dt.date} {dt.time} น.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-2.5">
                      {COLUMNS.filter((c) => c.key !== "fullName" && c.key !== "position").map((c) => (
                        <MobileField key={c.key} label={c.label}>
                          {String(e[c.key] ?? "") || "-"}
                        </MobileField>
                      ))}
                    </dl>

                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-[11px] text-slate-400 mb-1.5">สินค้าที่ได้รับ</p>
                      {pending ? (
                        <span className="inline-block h-5 w-24 rounded bg-slate-100 animate-pulse" />
                      ) : !st || st.selected.length === 0 ? (
                        <span className="text-slate-300">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {st.selected.map((it) => (
                            <span
                              key={`${it.source}:${it.productId}`}
                              className={`text-xs px-2 py-0.5 rounded-md border ${
                                it.source === "ACTIVITY"
                                  ? ""
                                  : it.received
                                  ? "bg-green-50 text-green-700 border-green-300"
                                  : "bg-red-50 text-red-600 border-red-300"
                              }`}
                              style={
                                it.source === "ACTIVITY"
                                  ? { backgroundColor: "#FFEDD5", color: "#C2410C", borderColor: "#FB923C" }
                                  : undefined
                              }
                            >
                              {it.productName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="p-4 text-center text-slate-400 text-sm">
                  {canImport
                    ? 'ยังไม่มีข้อมูล ลองวางลิงก์ Google Sheet แล้วกด "ดึงข้อมูล"'
                    : "ยังไม่มีข้อมูล"}
                </p>
              )}
            </div>

          <div className="hidden md:block bg-white border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-[13px] table-auto">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="text-left px-2.5 py-2.5 font-semibold">
                      {c.label}
                    </th>
                  ))}
                  <th className="text-left px-2.5 py-2.5 font-semibold">สินค้าที่ได้รับ</th>
                  <th className="text-left px-2.5 py-2.5 font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    {COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`px-2.5 py-2.5 align-top break-words ${c.bold ? "font-medium" : ""} ${
                          c.key === "startDate" || c.key === "employeeId" ? "whitespace-nowrap" : ""
                        }`}
                      >
                        {String(e[c.key] ?? "") || "-"}
                      </td>
                    ))}
                    <td className="px-2.5 py-2.5 align-top">
                      {(() => {
                        const st = itemStatus?.employees[e.employeeId];
                        if (itemsLoading && !itemStatus)
                          return <span className="inline-block h-5 w-24 rounded bg-slate-100 animate-pulse" />;
                        if (!st || st.selected.length === 0) return <span className="text-slate-300">-</span>;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {st.selected.map((it) => (
                              <span
                                key={`${it.source}:${it.productId}`}
                                className={`text-xs px-2 py-0.5 rounded-md border ${
                                  it.source === "ACTIVITY"
                                    ? ""
                                    : it.received
                                    ? "bg-green-50 text-green-700 border-green-300"
                                    : "bg-red-50 text-red-600 border-red-300"
                                }`}
                                // Activity items use inline colours (orange) so they can never be
                                // overridden by the theme / Tailwind palette and turn green.
                                style={
                                  it.source === "ACTIVITY"
                                    ? { backgroundColor: "#FFEDD5", color: "#C2410C", borderColor: "#FB923C" }
                                    : undefined
                                }
                                title={it.source === "ACTIVITY" ? "เบิกสำหรับกิจกรรม" : undefined}
                              >
                                {it.productName}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-2.5 py-2.5 align-top whitespace-nowrap">
                      {itemsLoading && !itemStatus ? (
                        <span className="inline-block h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
                      ) : (
                        <>
                          <StatusBadge
                            state={
                              itemStatus?.employees[e.employeeId]?.hasOnboarding
                                ? itemStatus.employees[e.employeeId].overall
                                : e.status === "ONBOARDED"
                                ? "COMPLETE"
                                : "NONE"
                            }
                          />
                          {(() => {
                            const dt = formatDateTime(itemStatus?.employees[e.employeeId]?.requestedAt);
                            if (!dt) return null;
                            return (
                              <div className="mt-1 pl-1 text-xs text-slate-500 leading-tight">
                                <div>{dt.date}</div>
                                <div>{dt.time} น.</div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="p-4 text-slate-400 text-sm">
                {canImport
                  ? 'ยังไม่มีข้อมูล ลองวางลิงก์ Google Sheet แล้วกด "ดึงข้อมูล"'
                  : "ยังไม่มีข้อมูล"}
              </p>
            )}
          </div>
          </>
        )}
      </main>
    </div>
  );
}