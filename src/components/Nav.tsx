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
  "/admin/dashboard": LayoutDashboard,
  "/admin/products": Boxes,
  "/admin/settings/onboarding-bundles": Sparkles,
  "/admin/employees": UserPlus,
  "/admin/returns": RotateCcw,
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
  // Mobile-only: slide-in drawer menu (replaces the old wrapping top nav
  // and the floating user chip).
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer after navigating.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock page scroll + Esc to close while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

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
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/products", label: "สินค้า" },
    { href: "/admin/settings/onboarding-bundles", label: "ชุดของพนักงานใหม่" },
    { href: "/admin/employees", label: "พนักงานใหม่" },
    { href: "/admin/returns", label: "ประวัติการคืนสินค้า  " },
  ];

  const admin2Links = [
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

  const roleClass = ROLE_STYLES[user.role] ?? "bg-slate-100 text-slate-700 ring-1 ring-slate-300";

  function requestLogout() {
    setDrawerOpen(false);
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

      {/* Mobile: compact top bar (menu button + logo + current page) */}
      <header className="md:hidden sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-1.5 h-14 px-2">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="เปิดเมนู"
            aria-expanded={drawerOpen}
            className="flex items-center justify-center w-11 h-11 rounded-xl text-slate-700 active:bg-slate-100 transition shrink-0"
          >
            <Menu className="w-6 h-6" />
          </button>
          <Link
            href="/staff/requisition"
            className="font-bold text-sm flex items-center gap-2 text-emerald-700 shrink-0"
          >
            <LogoMark className="h-6 w-auto" />
            Stock Req
          </Link>
          <div className="flex-1 min-w-0 flex justify-end pr-1">
            {currentLink && (
              <span className="truncate text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-3 py-1.5">
                {currentLink.label.trim()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Mobile: slide-in drawer with grouped links, user info and logout */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-slate-900/45 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[85%] max-w-xs bg-white shadow-2xl flex flex-col animate-drawer-in">
            <div className="flex items-center justify-between h-14 shrink-0 px-4 border-b border-slate-200 pt-[env(safe-area-inset-top)] box-content">
              <span className="font-bold text-sm flex items-center gap-2 text-emerald-700">
                <LogoMark className="h-6 w-auto" />
                Stock Req
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="ปิดเมนู"
                className="flex items-center justify-center w-10 h-10 -mr-2 rounded-xl text-slate-500 active:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col gap-4">
              {navGroups.map((g) => (
                <div key={g.title} className="flex flex-col gap-1">
                  <p className="px-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    {g.title}
                  </p>
                  {g.items.map((l) => {
                    const Icon = ICONS[l.href];
                    const active = pathname.startsWith(l.href);
                    return (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setDrawerOpen(false)}
                        className={cn(
                          "flex items-center gap-3 min-h-12 px-2.5 py-2 rounded-xl text-[15px] transition",
                          active
                            ? "bg-emerald-50 text-emerald-800 font-semibold"
                            : "text-slate-700 font-medium active:bg-slate-100"
                        )}
                      >
                        {Icon && (
                          <span
                            className={cn(
                              "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                              active
                                ? "bg-emerald-500 text-white shadow-sm"
                                : "bg-slate-100 text-slate-500"
                            )}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                        )}
                        <span className="leading-snug">{l.label.trim()}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="shrink-0 border-t border-slate-200 bg-slate-50 pb-[env(safe-area-inset-bottom)]">
              <div className="flex items-center gap-3 px-4 pt-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                  <UserIcon className="w-5 h-5" />
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-slate-800 leading-snug break-words">
                    {user.name}
                  </span>
                  <span
                    className={cn(
                      "inline-block mt-0.5 w-fit text-[10px] px-2 py-0.5 rounded-full font-medium",
                      roleClass
                    )}
                  >
                    {user.role}
                  </span>
                </div>
              </div>
              <div className="px-4 py-3">
                <button
                  onClick={requestLogout}
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-red-500 active:bg-red-600 text-white text-sm font-medium shadow-sm"
                >
                  <LogOut className="w-4 h-4" />
                  ออกจากระบบ
                </button>
              </div>
            </div>
          </aside>
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