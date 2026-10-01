"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import type { RequisitionLog } from "@/types";
import { formatDate, formatNumber } from "@/lib/utils";
import { HopLoader } from "@/components/HopLoader";
import { RotateCcw, CheckCircle2, X, AlertTriangle, History } from "lucide-react";
import Link from "next/link";

export default function StaffReturnsPage() {
  const [logs, setLogs] = useState<RequisitionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ log: RequisitionLog; qty: number } | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/requisitions?mine=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
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
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-xl font-bold">คืนของที่เบิกไป</h1>
          <Link
            href="/staff/returns/history"
            className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-sm font-medium transition"
          >
            <History className="w-3.5 h-3.5" />
            ประวัติของ
          </Link>
        </div>
        <p className="text-sm text-slate-500 mb-4">
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
        ) : returnable.length === 0 ? (
          <p className="text-slate-500">ไม่มีของที่สามารถคืนได้ในตอนนี้</p>
        ) : (
          <div className="space-y-3">
            {returnable.map((log) => {
              const remaining = log.quantityRequested - (log.returnedQuantity || 0);
              const partiallyReturned = (log.returnedQuantity || 0) > 0;
              return (
                <div
                  key={log.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {log.productName}{" "}
                      <span className="text-slate-500 font-normal">
                        เบิกไป {formatNumber(log.quantityRequested)}
                      </span>
                    </p>
                    <p className="text-sm text-slate-600 truncate">งาน: {log.eventName || "-"}</p>
                    {log.note && (
                      <p className="text-xs text-slate-500 truncate">เหตุผล: {log.note}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(log.createdAt)}</p>
                    {partiallyReturned && (
                      <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                        คืนไปแล้ว {formatNumber(log.returnedQuantity)} · เหลือคืนได้ {formatNumber(remaining)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={remaining}
                      placeholder={String(remaining)}
                      value={qtyInputs[log.id] ?? ""}
                      onChange={(e) => setQtyInputs((prev) => ({ ...prev, [log.id]: e.target.value }))}
                      className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right"
                    />
                    <button
                      onClick={() => requestReturn(log)}
                      disabled={submittingId === log.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {submittingId === log.id ? "กำลังคืน..." : "คืนของ"}
                    </button>
                  </div>
                </div>
              );
            })}
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