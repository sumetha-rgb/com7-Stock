"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import type { RequisitionLog } from "@/types";
import { formatDate, formatNumber } from "@/lib/utils";
import { HopLoader } from "@/components/HopLoader";

export default function HistoryPage() {
  const [logs, setLogs] = useState<RequisitionLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/requisitions?mine=true")
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-4">ประวัติการเบิกของฉัน</h1>
        {loading ? (
          <HopLoader />
        ) : logs.length === 0 ? (
          <p className="text-slate-500">ยังไม่มีประวัติการเบิก</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <p className="font-medium">
                    {log.productName}{" "}
                    <span className="text-slate-500 font-normal">
                      x{formatNumber(log.quantityRequested)}
                    </span>
                  </p>
                  <p className="text-sm text-slate-600">{log.eventName}</p>
                  {log.note && (
                    <p className="text-xs text-slate-500">หมายเหตุ: {log.note}</p>
                  )}
                  {log.isActivity && (
                    <span className="inline-block mt-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                      เบิกสำหรับกิจกรรม · ผู้รับ {log.employeeName}
                    </span>
                  )}
                  {log.isOnboarding && (
                    <span className="inline-block mt-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                      ชุดพนักงานใหม่ · ผู้เบิก {log.employeeName}
                    </span>
                  )}
                </div>
                <div className="text-right text-sm">
                  <span
                    className={
                      log.status === "SUCCESS"
                        ? "text-green-600 font-medium"
                        : "text-red-600 font-medium"
                    }
                  >
                    {log.status}
                  </span>
                  <p className="text-slate-400">{formatDate(log.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}