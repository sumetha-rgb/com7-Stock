"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A simple, reusable confirmation modal used across the app for destructive
 * actions (delete) and for making save state explicit ("กำลังบันทึก...").
 *
 * Usage:
 *   const [confirmOpen, setConfirmOpen] = useState(false);
 *   const [deleting, setDeleting] = useState(false);
 *   ...
 *   <ConfirmDialog
 *     open={confirmOpen}
 *     title="ลบรายการนี้?"
 *     description="การลบไม่สามารถย้อนกลับได้"
 *     loading={deleting}
 *     loadingLabel="กำลังลบ..."
 *     variant="danger"
 *     onCancel={() => setConfirmOpen(false)}
 *     onConfirm={handleDelete}
 *   />
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  loading = false,
  loadingLabel = "กำลังดำเนินการ...",
  variant = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
      onClick={() => !loading && onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6"
      >
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isDanger ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 pt-1">
            <h3 className="font-semibold text-slate-800">{title}</h3>
            {description && (
              <p className="text-sm text-slate-500 mt-1">{description}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-6 justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-70 flex items-center gap-2 min-w-[110px] justify-center ${
              isDanger
                ? "bg-red-600 hover:bg-red-500 active:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {loadingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}