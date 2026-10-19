"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BellRing, Loader2, Mail, MessageCircle, Send, X } from "lucide-react";

type Kind = "onboarding" | "activity";
type KindStatus = { pending: number; groups: number; people: number; lastSentAt: string; lastSentBy: string };
type Preview = {
  kind: Kind;
  pending: number;
  groups: number;
  people: number;
  batchIds: string[];
  audience?: { emailCount: number; lineConfigured: boolean };
  preview: { subject: string; html: string; flex: FlexNode; altText: string } | null;
};

const LABELS: Record<Kind, { title: string; hint: string }> = {
  onboarding: { title: "เบิกสำหรับพนักงานใหม่", hint: "สรุปการจัดชุดพนักงานใหม่ที่ยังไม่ได้แจ้ง" },
  activity: { title: "เบิกสำหรับกิจกรรม", hint: "สรุปการเบิกกิจกรรมที่ยังไม่ได้แจ้ง" },
};

// "วันนี้ 09:00" if it's before 09:00 in Bangkok, otherwise "พรุ่งนี้ 09:00".
function nextAutoRunText(): string {
  const bkk = new Date(Date.now() + 7 * 3600_000);
  return bkk.getUTCHours() < 9 ? "วันนี้ 09:00" : "พรุ่งนี้ 09:00";
}

function lastSentText(s?: KindStatus): string {
  if (!s || !s.lastSentAt) return "ยังไม่เคยส่ง";
  const when = new Date(s.lastSentAt).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${when}${s.lastSentBy ? ` · ${s.lastSentBy}` : ""}`;
}

// kind given  -> only that kind's button (used inside each requisition tab)
// kind absent -> both buttons (admin dashboard)
export function BatchDigestCard({ kind: only }: { kind?: Kind } = {}) {
  const kinds: Kind[] = only ? [only] : ["onboarding", "activity"];
  const [status, setStatus] = useState<Record<Kind, KindStatus> | null>(null);
  const [loadingKind, setLoadingKind] = useState<Kind | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<"email" | "line">("email");
  const [sending, setSending] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/digest", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.status) setStatus(data.status);
    } catch {
      /* card just stays empty */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function openPreview(kind: Kind) {
    setLoadingKind(kind);
    try {
      const res = await fetch(`/api/notifications/digest?kind=${kind}&preview=1`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "โหลดตัวอย่างไม่สำเร็จ");
      if (!data.preview) {
        toast("ไม่มีรายการรอแจ้ง");
        loadStatus();
        return;
      }
      setTab("email");
      setPreview(data as Preview);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "โหลดตัวอย่างไม่สำเร็จ");
    } finally {
      setLoadingKind(null);
    }
  }

  async function confirmSend() {
    if (!preview) return;
    setSending(true);
    try {
      const res = await fetch("/api/notifications/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: preview.kind, batchIds: preview.batchIds }),
      });
      const data = await res.json();
      if (res.status === 409) {
        // someone else already sent these batches -> never send twice
        toast(data.error || "มีผู้ใช้อื่นส่งสรุปไปแล้ว ระบบไม่ส่งซ้ำ", { icon: "ℹ️" });
        setPreview(null);
        return;
      }
      if (!res.ok) throw new Error(data.error || "ส่งไม่สำเร็จ");
      toast.success(`ส่งสรุปแล้ว ${data.groups} กลุ่ม · รอบ 09:00 จะไม่ส่งซ้ำ`);
      setPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
    } finally {
      setSending(false);
      loadStatus();
    }
  }

  const modal = (
    <>
      {preview?.preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
          onClick={() => !sending && setPreview(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-slate-900">ตัวอย่างก่อนส่ง · {LABELS[preview.kind].title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {preview.groups} กลุ่ม · {preview.people} คน · ส่งอีเมลถึงผู้ใช้ ACTIVE {preview.audience?.emailCount ?? 0} คน
                  {preview.audience?.lineConfigured ? " และกลุ่ม LINE HR" : " (ยังไม่ได้ตั้งกลุ่ม LINE)"}
                </p>
              </div>
              <button
                type="button"
                aria-label="ปิด"
                disabled={sending}
                onClick={() => setPreview(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 px-5 pt-4">
              {(["email", "line"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm border transition-colors ${
                    tab === t
                      ? "bg-emerald-600 text-white border-emerald-600 font-semibold"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {t === "email" ? <Mail className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                  {t === "email" ? "อีเมล" : "LINE"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === "email" ? (
                <>
                  <p className="text-xs text-slate-500 mb-2">
                    หัวข้อ: <span className="font-semibold text-slate-800">{preview.preview.subject}</span>
                  </p>
                  <iframe
                    title="email preview"
                    sandbox=""
                    srcDoc={preview.preview.html}
                    className="w-full h-[420px] border border-slate-200 rounded-xl bg-white"
                  />
                </>
              ) : (
                <div className="bg-[#8cabd9]/30 rounded-xl p-4 flex justify-center">
                  <div className="w-[300px] bg-white rounded-2xl overflow-hidden shadow">
                    <FlexBubble bubble={preview.preview.flex} />
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-2">
                {tab === "line"
                  ? "ภาพจำลองจากข้อมูลเดียวกับที่ส่งจริง การแสดงผลใน LINE อาจต่างเล็กน้อย"
                  : "อีเมลที่ส่งจริงเป็น HTML ชุดเดียวกับตัวอย่างนี้"}
              </p>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-slate-200">
              <button
                type="button"
                disabled={sending}
                onClick={() => setPreview(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={confirmSend}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                {sending ? "กำลังส่ง..." : "ยืนยันส่ง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ---- compact strip: used inside each requisition tab (one kind only) ----
  if (only) {
    const s = status?.[only];
    const pending = s?.groups ?? 0;
    const tone =
      only === "activity"
        ? { icon: "text-orange-600", soft: "bg-orange-50", btn: "bg-orange-500 hover:bg-orange-600", ring: "border-orange-100" }
        : { icon: "text-emerald-600", soft: "bg-emerald-50", btn: "bg-emerald-600 hover:bg-emerald-700", ring: "border-emerald-100" };
    return (
      <>
        <section className={`bg-white border ${tone.ring} rounded-2xl shadow-sm px-4 py-3`}>
          <div className="flex items-center gap-3">
            <span className={`shrink-0 w-10 h-10 rounded-xl grid place-items-center ${tone.soft}`}>
              <BellRing className={`w-5 h-5 ${tone.icon}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 leading-tight">แจ้งเตือนสรุปการเบิก</p>
              <p className="text-xs text-slate-500 truncate">
                {status ? (
                  pending ? (
                    <span className="font-semibold text-slate-800">รอแจ้ง {pending} กลุ่ม · {s?.people ?? 0} คน</span>
                  ) : (
                    "ไม่มีรายการรอแจ้ง"
                  )
                ) : (
                  "กำลังโหลด..."
                )}
                <span className="text-slate-400"> · {s?.lastSentAt ? `ส่งล่าสุด ${lastSentText(s)}` : "ยังไม่เคยส่ง"}</span>
              </p>
            </div>
            <button
              type="button"
              disabled={!pending || loadingKind !== null}
              onClick={() => openPreview(only)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white ${tone.btn} disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors`}
            >
              {loadingKind === only ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              ส่งสรุป{pending ? ` (${pending})` : ""}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 pl-[52px]">
            ส่งอัตโนมัติทุกวัน 09:00 ({nextAutoRunText()}) · ไม่มีรายการจะไม่ส่ง · ไม่ส่งซ้ำ
          </p>
        </section>
        {modal}
      </>
    );
  }

  return (
    <>
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2">
        <BellRing className="w-5 h-5 text-emerald-600" />
        <h2 className="font-bold text-slate-900">แจ้งเตือนสรุปการเบิก</h2>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        ระบบส่งสรุปอัตโนมัติทุกวัน 09:00 ({nextAutoRunText()}) รวมการเบิกที่ยังไม่ได้แจ้ง (แม้มีคนเดียว) กดปุ่มเพื่อส่งก่อนเวลา
        ถ้าไม่มีรายการจะไม่ส่งอะไร และรอบอัตโนมัติจะไม่ส่งซ้ำ
      </p>

      <div className={`grid gap-3 mt-4 ${only ? "" : "md:grid-cols-2"}`}>
        {kinds.map((kind) => {
          const s = status?.[kind];
          const pending = s?.groups ?? 0;
          return (
            <div key={kind} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div>
                <p className="font-semibold text-slate-900">{LABELS[kind].title}</p>
                <p className="text-xs text-slate-400">{LABELS[kind].hint}</p>
              </div>
              <div className="text-sm">
                <p className={pending ? "text-slate-900 font-semibold" : "text-slate-400"}>
                  {status ? (pending ? `รอแจ้ง ${pending} กลุ่ม (${s?.people ?? 0} คน)` : "ไม่มีรายการรอแจ้ง") : "กำลังโหลด..."}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">ส่งล่าสุด: {lastSentText(s)}</p>
              </div>
              <button
                type="button"
                disabled={!pending || loadingKind !== null}
                onClick={() => openPreview(kind)}
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {loadingKind === kind && <Loader2 className="w-4 h-4 animate-spin" />}
                ส่งสรุปตอนนี้{pending ? ` (${pending})` : ""}
              </button>
            </div>
          );
        })}
      </div>

    </section>
      {modal}
    </>
  );
}

// ---------- minimal LINE Flex renderer (only what our digest card uses) ----------
type FlexNode = {
  type: string;
  layout?: "vertical" | "horizontal";
  contents?: FlexNode[];
  text?: string;
  size?: string;
  color?: string;
  weight?: string;
  align?: string;
  flex?: number;
  wrap?: boolean;
  margin?: string;
  spacing?: string;
  paddingAll?: string;
  backgroundColor?: string;
  letterSpacing?: string;
  header?: FlexNode;
  body?: FlexNode;
  footer?: FlexNode;
};

const FONT: Record<string, number> = { xxs: 10, xs: 12, sm: 14, md: 16, lg: 18 };
const GAP: Record<string, number> = { none: 0, xs: 2, sm: 6, md: 10, lg: 16 };

function FlexBubble({ bubble }: { bubble: FlexNode }) {
  return (
    <div>
      {bubble.header && <FlexNodeView n={bubble.header} />}
      {bubble.body && <FlexNodeView n={bubble.body} />}
      {bubble.footer && <FlexNodeView n={bubble.footer} />}
    </div>
  );
}

function FlexNodeView({ n, inRow = false }: { n: FlexNode; inRow?: boolean }) {
  if (n.type === "separator") {
    return <hr style={{ margin: `${GAP[n.margin || "md"]}px 0`, border: 0, borderTop: "1px solid #e2e8f0" }} />;
  }
  if (n.type === "text") {
    return (
      <div
        style={{
          fontSize: FONT[n.size || "md"],
          color: n.color || "#111827",
          fontWeight: n.weight === "bold" ? 700 : 400,
          textAlign: (n.align as "end" | "center" | "start") === "end" ? "right" : (n.align as "center" | undefined),
          letterSpacing: n.letterSpacing,
          marginTop: n.margin ? GAP[n.margin] : undefined,
          flex: inRow ? n.flex ?? 1 : undefined,
          wordBreak: "break-word",
          lineHeight: 1.45,
        }}
      >
        {n.text}
      </div>
    );
  }
  // box
  const horizontal = n.layout === "horizontal";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        gap: n.spacing ? GAP[n.spacing] : 0,
        padding: n.paddingAll ? parseInt(n.paddingAll, 10) : 0,
        background: n.backgroundColor,
        marginTop: n.margin ? GAP[n.margin] : undefined,
        flex: inRow ? n.flex ?? 1 : undefined,
      }}
    >
      {(n.contents || []).map((c, i) => (
        <FlexNodeView key={i} n={c} inRow={horizontal} />
      ))}
    </div>
  );
}