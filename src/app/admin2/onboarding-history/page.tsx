"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { HopLoader } from "@/components/HopLoader";
import { CalendarRange, Search } from "lucide-react";
import { MobileField } from "@/components/MobileField";

interface OnboardingHistoryEntry {
  employeeId: string;
  requestedBy: string;
  claimedAt: string;
  company: string;
  month: string;
  startDate: string;
  fullName: string;
  position: string;
  department: string;
  status: string;
}

export default function Admin2OnboardingHistoryPage() {
  const [rows, setRows] = useState<OnboardingHistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const qs = params.toString();
    fetch(`/api/employees/onboarding-history${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(search.toLowerCase()) ||
          r.requestedBy.toLowerCase().includes(search.toLowerCase()) ||
          r.company.toLowerCase().includes(search.toLowerCase()) ||
          r.department.toLowerCase().includes(search.toLowerCase()) ||
          r.position.toLowerCase().includes(search.toLowerCase())
      ),
    [rows, search]
  );

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">ประวัติการเบิกของพนักงานใหม่</h1>
        <p className="text-sm text-slate-500 mb-4">
          รายการเบิกชุดของ Onboarding แต่ละครั้ง พร้อมชื่อผู้เบิกและข้อมูลพนักงานใหม่ที่เกี่ยวข้อง
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อผู้เบิก / พนักงาน / บริษัท / หน่วยงาน..."
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
        </div>

        {loading ? (
          <HopLoader />
        ) : (
          <>
            {/* Mobile: one card per withdrawal */}
            <div className="md:hidden space-y-3">
              {filtered.map((r, i) => (
                <div key={`${r.employeeId}-${i}`} className="bg-white border rounded-xl shadow-sm p-4">
                  <p className="font-semibold text-slate-900 leading-snug break-words">{r.fullName || "-"}</p>
                  <p className="text-xs text-slate-500 mt-0.5 break-words">{r.position || "-"}</p>
                  <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <MobileField label="ชื่อผู้เบิก" className="col-span-2">{r.requestedBy || "-"}</MobileField>
                    <MobileField label="บริษัท">{r.company || "-"}</MobileField>
                    <MobileField label="หน่วยงาน">{r.department || "-"}</MobileField>
                    <MobileField label="เดือน">{r.month || "-"}</MobileField>
                    <MobileField label="วันที่เริ่มงาน">{r.startDate || "-"}</MobileField>
                  </dl>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="p-4 text-center text-slate-400 text-sm">ยังไม่มีประวัติการเบิก</p>
              )}
            </div>

          <div className="hidden md:block bg-white border rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold">ชื่อผู้เบิก</th>
                  <th className="text-left px-4 py-2.5 font-semibold">บริษัท</th>
                  <th className="text-left px-4 py-2.5 font-semibold">เดือน</th>
                  <th className="text-left px-4 py-2.5 font-semibold">วันที่เริ่มงาน</th>
                  <th className="text-left px-4 py-2.5 font-semibold">รายชื่อพนักงาน</th>
                  <th className="text-left px-4 py-2.5 font-semibold">ตำแหน่ง</th>
                  <th className="text-left px-4 py-2.5 font-semibold">หน่วยงาน</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r, i) => (
                  <tr key={`${r.employeeId}-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.requestedBy || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.company || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.month || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.startDate || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.fullName || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.position || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.department || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="p-4 text-slate-400 text-sm">ยังไม่มีประวัติการเบิก</p>
            )}
          </div>
          </>
        )}
      </main>
    </div>
  );
}