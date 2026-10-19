"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types";
import { LogoMark } from "@/components/LogoMark";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";
import {
  PackageOpen,
  History,
  LayoutDashboard,
  Boxes,
  Sparkles,
  UserPlus,
  Users,
  ScrollText,
  DatabaseZap,
  ClipboardList,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  RotateCcw,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/staff/requisition": PackageOpen,
  "/staff/history": History,
  "/staff/returns": RotateCcw,
  "/staff/employee-database": DatabaseZap,
  "/admin/products": Boxes,
  "/admin/settings/onboarding-bundles": Sparkles,
  "/admin/employees": UserPlus,
  "/admin/returns": RotateCcw,
  "/admin2/dashboard": LayoutDashboard,
  "/admin2/users": Users,
  "/admin2/employee-database": DatabaseZap,
  "/admin2/onboarding-history": ClipboardList,
  "/admin2/audit-log": ScrollText,
  "/admin2/returns": RotateCcw,
};

const ROLE_STYLES: Record<string, string> = {
  Admin2: "bg-purple-100 text-purple-700 ring-1 ring-purple-300",
  Admin: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300",
  Staff: "bg-sky-100 text-sky-700 ring-1 ring-sky-300",
};

export function Nav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const user = session?.user as SessionUser | undefined;
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // Mobile-only: bottom sheet opened from the "เมนู" tab / profile button.
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasUser = !!user;

  // Close the sheet after navigating.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  // Reserve room for the fixed bottom tab bar (see .has-tabbar in globals.css).
  useEffect(() => {
    if (!hasUser) return;
    document.body.classList.add("has-tabbar");
    return () => document.body.classList.remove("has-tabbar");
  }, [hasUser]);

  // Lock page scroll + Esc to close while the sheet is open.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  if (!user) return null;

  const staffLinks = [
    { href: "/staff/requisition", label: "Overview" },
    { href: "/staff/history", label: "ประวัติการเบิก" },
    { href: "/staff/returns", label: "คืนสินค้า" },
    // Admin2 already has the full version (with import) under ผู้ดูแลระบบ.
    ...(user.role !== "Admin2"
      ? [{ href: "/staff/employee-database", label: "ฐานข้อมูลพนักงานใหม่" }]
      : []),
  ];

  const adminLinks = [
    { href: "/admin/products", label: "สินค้า" },
    { href: "/admin/settings/onboarding-bundles", label: "ชุดของพนักงานใหม่" },
    { href: "/admin/employees", label: "พนักงานใหม่" },
    { href: "/admin/returns", label: "ประวัติการคืนสินค้า  " },
  ];

  const admin2Links = [
    { href: "/admin2/dashboard", label: "Dashboard" },
    { href: "/admin2/users", label: "จัดการผู้ใช้งาน" },
    { href: "/admin2/employee-database", label: "ฐานข้อมูลพนักงานใหม่" },
    { href: "/admin2/onboarding-history", label: "ประวัติการเบิกของพนักงานใหม่" },
    { href: "/admin2/audit-log", label: "ประวัติการแก้ไขระบบ" },
  ];

  let links = [...staffLinks];
  if (user.role === "Admin" || user.role === "Admin2") {
    links = [...links, ...adminLinks];
  }
  if (user.role === "Admin2") {
    links = [...links, ...admin2Links];
  }

  const navGroups = [
    { title: "งานทั่วไป", items: staffLinks },
    ...(user.role === "Admin" || user.role === "Admin2"
      ? [{ title: "จัดการคลังสินค้า", items: adminLinks }]
      : []),
    ...(user.role === "Admin2" ? [{ title: "ผู้ดูแลระบบ", items: admin2Links }] : []),
  ];

  const currentLink = links
    .filter((l) => pathname.startsWith(l.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  // Bottom tab bar: 4 shortcuts (2 each side) around the centre "เมนู" button.
  const SHORT: Record<string, string> = {
    "/staff/requisition": "เบิกของ",
    "/staff/history": "ประวัติ",
    "/staff/returns": "คืนของ",
    "/staff/employee-database": "พนักงานใหม่",
    "/admin/products": "สินค้า",
    "/admin2/dashboard": "ภาพรวม",
  };
  const tabHrefs =
    user.role === "Admin2"
      ? ["/admin2/dashboard", "/staff/requisition", "/staff/history", "/staff/returns"]
      : user.role === "Admin"
      ? ["/staff/requisition", "/staff/history", "/staff/returns", "/admin/products"]
      : ["/staff/requisition", "/staff/history", "/staff/returns", "/staff/employee-database"];
  const tabs = tabHrefs.map((href) => ({ href, short: SHORT[href] }));
  const leftTabs = tabs.slice(0, 2);
  const rightTabs = tabs.slice(2);
  const initial = (user.name || "?").trim().charAt(0).toUpperCase();

  const roleClass = ROLE_STYLES[user.role] ?? "bg-slate-100 text-slate-700 ring-1 ring-slate-300";

  function requestLogout() {
    setSheetOpen(false);
    setConfirmLogout(true);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await signOut({ callbackUrl: "/login" });
  }

  const userCard = (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      {/* User info row */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
          <UserIcon className="w-4 h-4" />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-slate-800 leading-snug break-words">
            {user.name}
          </span>
          <span
            className={cn(
              "inline-block mt-0.5 w-fit text-[9px] px-1.5 py-0.5 rounded-full font-medium",
              roleClass
            )}
          >
            {user.role}
          </span>
        </div>
      </div>

      {/* Logout row */}
      <button
        onClick={requestLogout}
        className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-600 text-white text-xs font-medium transition shadow-sm"
      >
        <LogOut className="w-3.5 h-3.5" />
        ออกจากระบบ
      </button>
    </div>
  );

  return (
    <>
      <PageTransitionOverlay show={loggingOut} label="กำลังออกจากระบบ..." />

      {/* Desktop / tablet: permanent left sidebar (fills the space that used
          to sit empty to the left of the centered page content). */}
      <aside
        className="hidden md:flex md:flex-col fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-slate-200 shadow-sm"
      >
        <Link
          href="/staff/requisition"
          className="font-bold text-sm px-4 h-14 shrink-0 flex items-center gap-2 text-emerald-700 border-b border-slate-200"
        >
          <LogoMark className="h-6 w-auto" />
          Stock Req
        </Link>

        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 flex flex-col gap-3 min-h-0">
          {navGroups.map((g) => (
            <div key={g.title} className="flex flex-col gap-0.5">
              <p className="px-2.5 mb-0.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                {g.title}
              </p>
              {g.items.map((l) => {
                const Icon = ICONS[l.href];
                const active = pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "group relative px-2.5 py-1.5 rounded-lg text-[13px] transition flex items-center gap-2",
                      active
                        ? "bg-emerald-50 text-emerald-800 font-semibold"
                        : "text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-emerald-500" />
                    )}
                    {Icon && (
                      <span
                        className={cn(
                          "flex items-center justify-center w-6 h-6 rounded-lg shrink-0 transition",
                          active
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-500 group-hover:bg-white"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <span className="truncate">{l.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50">
          {userCard}
        </div>
      </aside>

      {/* Mobile: app-style top bar (logo + current page title + profile) */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 h-14 px-4">
          <Link href="/staff/requisition" aria-label="หน้าแรก" className="shrink-0">
            <LogoMark className="h-6 w-auto" />
          </Link>
          <h1 className="flex-1 min-w-0 truncate text-[17px] font-bold tracking-tight text-slate-900">
            {currentLink ? currentLink.label.trim() : "Stock Req"}
          </h1>
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="เปิดโปรไฟล์และเมนู"
            className="shrink-0 active:scale-95 transition-transform"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-[17px] font-bold">
              {initial}
            </span>
          </button>
        </div>
      </header>

      {/* Mobile: bottom tab bar - curved cradle with a raised centre "เมนู" button */}
      <nav
        aria-label="เมนูหลัก"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 pointer-events-none"
        style={{ filter: "drop-shadow(0 -4px 12px rgba(15,23,42,0.10))" }}
      >
        <div className="relative flex h-16 pointer-events-auto">
          {[leftTabs, null, rightTabs].map((group, gi) =>
            group === null ? (
              /* Centre cradle: a real flex item, so the white side bars stop at the notch */
              <div key="centre" className="relative w-24 shrink-0">
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 96 64"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M0 0H8C14 0 16 4 20.1 10A29 29 0 0 0 75.9 10C80 4 82 0 88 0H96V64H0Z"
                    fill="#ffffff"
                  />
                </svg>
                <button
                  onClick={() => setSheetOpen(true)}
                  aria-label="เปิดเมนู"
                  aria-haspopup="dialog"
                  aria-expanded={sheetOpen}
                  className="absolute left-1/2 -translate-x-1/2 -top-[25px] flex items-center justify-center w-[54px] h-[54px] rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 ring-[3px] ring-white active:scale-95 transition-transform"
                >
                  <Menu className="w-7 h-7" strokeWidth={2.25} />
                </button>
                <span className="absolute inset-x-0 bottom-2 text-center text-[11px] leading-none font-bold text-emerald-700 select-none">
                  เมนู
                </span>
              </div>
            ) : (
              <ul
                key={gi}
                className={cn("flex flex-1 bg-white", gi === 0 ? "rounded-tl-[28px] pl-1" : "rounded-tr-[28px] pr-1")}
              >
                {group.map((t) => {
                  const Icon = ICONS[t.href];
                  const active = !sheetOpen && pathname.startsWith(t.href);
                  return (
                    <li key={t.href} className="flex-1 relative">
                      {active && (
                        <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b-full bg-emerald-500" />
                      )}
                      <Link
                        href={t.href}
                        aria-current={active ? "page" : undefined}
                        className="flex flex-col items-center justify-center gap-1 h-full select-none active:scale-90 transition-transform"
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center h-8 w-8 rounded-2xl transition-all duration-200",
                            active ? "bg-emerald-50 text-emerald-600 scale-110" : "text-slate-400"
                          )}
                        >
                          {Icon && <Icon className="w-[22px] h-[22px]" />}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] leading-none whitespace-nowrap",
                            active ? "font-bold text-emerald-700" : "font-medium text-slate-500"
                          )}
                        >
                          {t.short}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
        <div className="bg-white pointer-events-auto" style={{ height: "env(safe-area-inset-bottom)" }} />
      </nav>

      {/* Mobile: bottom sheet with profile, every page as a tile grid, logout */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="เมนู">
          <div className="absolute inset-0 bg-slate-900/45 animate-fade-in" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88%] flex flex-col rounded-t-3xl bg-slate-50 shadow-2xl animate-sheet-up">
            <div className="shrink-0 pt-2.5 pb-1 flex justify-center">
              <span className="h-1.5 w-10 rounded-full bg-slate-300" />
            </div>

            <div className="shrink-0 px-4 pt-1 pb-3">
              <div className="relative overflow-hidden rounded-3xl bg-emerald-50 border border-emerald-100 text-slate-800 p-4">
                <div className="flex items-center gap-3.5 pr-12">
                  <span className="flex items-center justify-center w-14 h-14 rounded-full bg-white text-emerald-600 text-2xl font-bold ring-2 ring-emerald-200 shrink-0">
                    {initial}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-emerald-700/80 leading-none mb-1">ยินดีต้อนรับ</p>
                    <p className="text-[17px] font-bold leading-snug break-words text-slate-900">{user.name}</p>
                    <span className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold bg-white text-emerald-700 ring-1 ring-emerald-200 rounded-full px-2.5 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {user.role}
                    </span>
                  </div>
                </div>
                {/* Placed last + z-10 so nothing overlaps it and it stays tappable */}
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="ปิดเมนู"
                  className="absolute top-3 right-3 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-white text-slate-600 ring-1 ring-emerald-200 active:bg-emerald-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-3 flex flex-col gap-4">
              {navGroups.map((g) => (
                <section key={g.title}>
                  <p className="px-1 mb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{g.title}</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {g.items.map((l) => {
                      const Icon = ICONS[l.href];
                      const active = pathname.startsWith(l.href);
                      return (
                        <Link
                          key={l.href}
                          href={l.href}
                          onClick={() => setSheetOpen(false)}
                          className={cn(
                            "flex flex-col items-center justify-start gap-2 rounded-2xl px-1.5 py-3 text-center border transition active:scale-95",
                            active
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-white border-slate-200 text-slate-700"
                          )}
                        >
                          <span
                            className={cn(
                              "flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
                              active ? "bg-emerald-500 text-white shadow-sm" : "bg-slate-100 text-slate-500"
                            )}
                          >
                            {Icon && <Icon className="w-5 h-5" />}
                          </span>
                          <span className="text-[12px] font-semibold leading-tight line-clamp-2 break-words">
                            {l.label.trim()}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="shrink-0 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-slate-200 bg-white rounded-b-none">
              <button
                onClick={requestLogout}
                className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-red-50 text-red-600 text-[15px] font-semibold active:bg-red-100 transition"
              >
                <LogOut className="w-5 h-5" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmLogout}
        title="ออกจากระบบ?"
        description="คุณจะต้องเข้าสู่ระบบใหม่อีกครั้งเพื่อใช้งานต่อ"
        confirmLabel="ออกจากระบบ"
        variant="danger"
        loading={loggingOut}
        loadingLabel="กำลังออก..."
        onCancel={() => setConfirmLogout(false)}
        onConfirm={handleLogout}
      />
    </>
  );
}