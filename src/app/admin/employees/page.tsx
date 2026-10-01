"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import type { Employee } from "@/types";
import { HopLoader } from "@/components/HopLoader";
import { CalendarRange, Search } from "lucide-react";
import { MobileField } from "@/components/MobileField";

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
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
    fetch(`/api/employees${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  const filtered = useMemo(
    () =>
      employees
        .filter(
          (e) =>
            e.fullName.toLowerCase().includes(search.toLowerCase()) ||
            e.company.toLowerCase().includes(search.toLowerCase()) ||
            e.department.toLowerCase().includes(search.toLowerCase()) ||
            e.position.toLowerCase().includes(search.toLowerCase())
        )
        // Newest start date first
        .sort((a, b) => (a.startDate < b.startDate ? 1 : -1)),
    [employees, search]
  );

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">พนักงานใหม่</h1>
        <p className="text-sm text-slate-500 mb-4">
          ข้อมูลดึงมาจากฐานข้อมูลพนักงานใหม่ (Google Sheet) โดยแอดมินระบบ (Admin2)
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / บริษัท / หน่วยงาน / ตำแหน่ง..."
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
              aria-label="ตั้งแต่วันที่"
            />
            <span className="text-slate-400 text-sm">ถึง</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-sm outline-none flex-1 min-w-0 sm:flex-none"
              aria-label="ถึงวันที่"
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
            {/* Mobile: one card per employee */}
            <div className="md:hidden space-y-3">
              {filtered.map((emp) => (
                <div key={emp.id} className="bg-white border rounded-xl shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 leading-snug break-words">{emp.fullName}</p>
                      <p className="text-xs text-slate-500 mt-0.5 break-words">{emp.position || "-"}</p>
                    </div>
                    <span
                      className={`shrink-0 text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${
                        emp.status === "ONBOARDED"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {emp.status === "ONBOARDED" ? "ได้รับแล้ว" : "ยังไม่ได้รับ"}
                    </span>
                  </div>
                  <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <MobileField label="บริษัท">{emp.company || "-"}</MobileField>
                    <MobileField label="วันที่เริ่มงาน">{emp.startDate || "-"}</MobileField>
                    <MobileField label="หน่วยงาน" className="col-span-2">{emp.department || "-"}</MobileField>
                  </dl>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="p-4 text-center text-slate-400 text-sm">ไม่พบข้อมูล</p>
              )}
            </div>

          <div className="hidden md:block bg-white border rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold">บริษัท</th>
                  <th className="text-left px-4 py-2.5 font-semibold">วันที่เริ่มงาน</th>
                  <th className="text-left px-4 py-2.5 font-semibold">รายชื่อพนักงาน</th>
                  <th className="text-left px-4 py-2.5 font-semibold">ตำแหน่ง</th>
                  <th className="text-left px-4 py-2.5 font-semibold">หน่วยงาน</th>
                  <th className="text-left px-4 py-2.5 font-semibold">ได้รับชุดเบิกแล้วหรือยัง</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap">{emp.company || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{emp.startDate || "-"}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{emp.fullName}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{emp.position || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{emp.department || "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          emp.status === "ONBOARDED"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {emp.status === "ONBOARDED" ? "ได้รับแล้ว" : "ยังไม่ได้รับ"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="p-4 text-slate-400 text-sm">ไม่พบข้อมูล</p>
            )}
          </div>
          </>
        )}
      </main>
    </div>
  );
}