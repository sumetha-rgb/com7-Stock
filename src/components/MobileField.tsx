import type { ReactNode } from "react";

/** Small label + value pair used inside the mobile card layout of table pages. */
export function MobileField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[11px] text-slate-400 leading-tight">{label}</dt>
      <dd className="text-[13px] text-slate-700 font-medium break-words mt-0.5">{children}</dd>
    </div>
  );
}