/**
 * HopLoader
 * A cardboard box that hops across a dashed track and fades out at the end,
 * looping continuously. Use this anywhere a full-section loading state is
 * needed (page loads, table loads). For small inline states inside buttons,
 * keep using the spinning icon (see ConfirmDialog).
 *
 * Usage:
 *   {loading ? <HopLoader label="กำลังโหลดสินค้า..." /> : <YourContent />}
 */
export function HopLoader({
  label = "กำลังโหลด...",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 py-10 ${className}`}>
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
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}