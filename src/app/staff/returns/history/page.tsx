"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { formatDate, formatNumber } from "@/lib/utils";
import { HopLoader } from "@/components/HopLoader";
import { ArrowLeft, RotateCcw } from "lucide-react";

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

  useEffect(() => {
    fetch("/api/returns/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...items].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/staff/returns" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> กลับไปหน้าคืนของ
        </Link>
        <h1 className="text-xl font-bold mb-1">ประวัติคืนของ</h1>
        <p className="text-sm text-slate-500 mb-4">รายละเอียดของทุกครั้งที่คุณคืนของกลับเข้าคลัง</p>

        {loading ? (
          <HopLoader />
        ) : sorted.length === 0 ? (
          <p className="text-slate-400 text-sm">ยังไม่มีประวัติการคืนของ</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((it) => (
              <div
                key={it.id}
                className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {it.productName} <span className="text-slate-400 font-normal">x{formatNumber(it.quantity)} {it.unit}</span>
                    </p>
                    {it.returnedBy && (
                      <p className="text-xs text-slate-400">ดำเนินการโดย {it.returnedBy}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{formatDate(it.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}