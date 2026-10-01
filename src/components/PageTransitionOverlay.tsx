"use client";

/**
 * PageTransitionOverlay
 * Full-screen loading overlay that feels like the page is switching —
 * use for login, save/submit, or any action that leads to navigation
 * or a meaningful wait.
 *
 * variant:
 *  - "default" (box hop, same as HopLoader) — used everywhere unless noted
 *  - "bars"    (growing bar chart)          — admin/dashboard only
 *  - "avatars" (two avatars swapping)       — admin2/users only
 *
 * Usage:
 *   const [loading, setLoading] = useState(false);
 *   ...
 *   <PageTransitionOverlay show={loading} label="กำลังเข้าสู่ระบบ..." />
 *   <PageTransitionOverlay show={loading} variant="bars" label="กำลังประมวลผลภาพรวม..." />
 *   <PageTransitionOverlay show={loading} variant="avatars" label="กำลังอัปเดตผู้ใช้งาน..." />
 */
export function PageTransitionOverlay({
  show,
  label = "กำลังโหลด...",
  variant = "default",
}: {
  show: boolean;
  label?: string;
  variant?: "default" | "bars" | "avatars";
}) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm transition-opacity duration-200"
      style={{ animation: "overlayFadeIn 0.18s ease-out" }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        {variant === "bars" && <BarsAnimation />}
        {variant === "avatars" && <AvatarsAnimation />}
        {variant === "default" && <BoxHopAnimation />}
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
    </div>
  );
}

function BoxHopAnimation() {
  return (
    <div className="relative w-[220px] h-[46px] border-b-2 border-dashed border-emerald-200">
      <div
        className="absolute bottom-1.5 left-0 w-[26px] h-5 rounded-[3px]"
        style={{
          background:
            "linear-gradient(160deg,#E3C296 0%,#C89B6A 55%,#9C7042 100%)",
          boxShadow: "inset -4px 0 0 rgba(0,0,0,.12)",
          animation: "hopAcross 2.4s ease-in-out infinite",
        }}
      >
        <span
          className="absolute -top-1.5 left-0.5 right-0.5 h-[6px] rounded-t-[2px]"
          style={{
            background: "linear-gradient(180deg,#F1D8B4,#D4AC7C)",
            clipPath: "polygon(8% 100%, 92% 100%, 100% 0, 0 0)",
          }}
        />
      </div>
    </div>
  );
}

function BarsAnimation() {
  const delays = [0, 0.12, 0.24, 0.36, 0.48];
  return (
    <div className="flex items-end gap-1.5 h-[52px]">
      {delays.map((d, i) => (
        <span
          key={i}
          className="block w-3 rounded-t-[3px]"
          style={{
            background: "linear-gradient(180deg, #34d399, #059669)",
            animation: "barGrow 1.1s ease-in-out infinite",
            animationDelay: `${d}s`,
          }}
        />
      ))}
    </div>
  );
}

function AvatarsAnimation() {
  return (
    <div className="relative w-20 h-10">
      <span
        className="absolute top-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ background: "#059669", animation: "swapA 1.6s ease-in-out infinite" }}
      >
        A
      </span>
      <span
        className="absolute top-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ background: "#0891b2", animation: "swapB 1.6s ease-in-out infinite" }}
      >
        B
      </span>
    </div>
  );
}