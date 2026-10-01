"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import type { Product, RequisitionLog } from "@/types";
import { formatNumber } from "@/lib/utils";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";
import { Boxes, PackageCheck, AlertTriangle, ClipboardList, TrendingUp, CheckCircle2, XCircle } from "lucide-react";

// ---------- helpers ----------
const dayKey = (d: Date) => d.toLocaleDateString("en-CA"); // yyyy-mm-dd (local time)

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

type StockState = "out" | "low" | "ok";
const stateOf = (p: Product): StockState =>
  p.quantity <= 0 ? "out" : p.quantity <= p.lowStockThreshold ? "low" : "ok";

// ---------- small UI pieces ----------
function StatCard(props: {
  icon: React.ReactNode;
  tone: "emerald" | "sky" | "red" | "violet";
  label: string;
  value: string;
  hint: string;
}) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700",
    sky: "bg-sky-100 text-sky-700",
    red: "bg-red-100 text-red-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tones[props.tone]}`}>
          {props.icon}
        </span>
        <p className="text-sm font-medium text-slate-500">{props.label}</p>
      </div>
      <p className="text-3xl font-extrabold tracking-tight text-slate-900 mt-3 leading-none">{props.value}</p>
      <p className="text-xs text-slate-400 mt-1.5">{props.hint}</p>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <h2 className="font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<RequisitionLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load once on mount; abort on unmount so no duplicate requests keep running.
    const ctrl = new AbortController();
    Promise.all([
      fetch("/api/products", { signal: ctrl.signal }).then((r) => r.json()),
      fetch("/api/requisitions", { signal: ctrl.signal }).then((r) => r.json()),
    ])
      .then(([prods, lg]) => {
        setProducts(Array.isArray(prods) ? prods : []);
        setLogs(Array.isArray(lg) ? lg : []);
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const d = useMemo(() => {
    const out = products.filter((p) => stateOf(p) === "out");
    const low = products.filter((p) => stateOf(p) === "low");
    const ok = products.filter((p) => stateOf(p) === "ok");
    const needRestock = [...out, ...low].sort((a, b) => a.quantity / (a.lowStockThreshold || 1) - b.quantity / (b.lowStockThreshold || 1));

    const success = logs.filter((l) => l.status !== "FAILED");
    const today = dayKey(new Date());
    const monthPrefix = today.slice(0, 7);
    const todayCount = success.filter((l) => dayKey(new Date(l.createdAt)) === today).length;
    const monthUnits = success
      .filter((l) => dayKey(new Date(l.createdAt)).startsWith(monthPrefix))
      .reduce((s, l) => s + l.quantityRequested, 0);

    // last 7 days (oldest -> newest)
    const days = Array.from({ length: 7 }, (_, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - (6 - i));
      return {
        key: dayKey(dt),
        label: dt.toLocaleDateString("th-TH", { weekday: "short" }),
        date: dt.getDate(),
        count: 0,
        items: [] as { userName: string; productName: string; quantity: number }[],
      };
    });
    for (const l of success) {
      const k = dayKey(new Date(l.createdAt));
      const hit = days.find((x) => x.key === k);
      if (hit) {
        hit.count += 1;
        hit.items.push({
          userName: l.isOnboarding || l.isActivity ? l.employeeName || l.userName : l.userName,
          productName: l.productName,
          quantity: l.quantityRequested,
        });
      }
    }

    // top requested products in the last 30 days
    const since = Date.now() - 30 * 86400000;
    const byProduct = new Map<string, number>();
    for (const l of success) {
      if (new Date(l.createdAt).getTime() >= since) {
        byProduct.set(l.productName, (byProduct.get(l.productName) || 0) + l.quantityRequested);
      }
    }
    const top = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      out, low, ok, needRestock, todayCount, monthUnits, days, top,
      totalUnits: products.reduce((s, p) => s + p.quantity, 0),
      recent: logs.slice(0, 8),
    };
  }, [products, logs]);

  const todayText = new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const maxDay = Math.max(1, ...d.days.map((x) => x.count));
  const maxTop = Math.max(1, ...d.top.map((x) => x[1]));
  const total = Math.max(1, products.length);

  return (
    <div className="min-h-screen bg-transparent md:pl-60">
      <PageTransitionOverlay show={loading} variant="bars" label="กำลังโหลดภาพรวม..." />
      <Nav />
      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">ภาพรวมคลังสินค้า</h1>
          <p className="text-sm text-slate-500 mt-0.5">{todayText} · ดูสถานะของในคลังและการเบิกล่าสุดได้ที่นี่</p>
        </div>

        {!loading && (
          <div className="space-y-5">
            {/* 1) Key numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={<Boxes className="w-5 h-5" />} tone="emerald" label="สินค้าในระบบ"
                value={formatNumber(products.length)} hint={`รวมของในคลัง ${formatNumber(d.totalUnits)} ชิ้น`} />
              <StatCard icon={<AlertTriangle className="w-5 h-5" />} tone="red" label="ต้องเติมของ"
                value={formatNumber(d.out.length + d.low.length)}
                hint={d.out.length ? `หมดแล้ว ${d.out.length} · ใกล้หมด ${d.low.length}` : "ใกล้หมดตามที่ตั้งไว้"} />
              <StatCard icon={<ClipboardList className="w-5 h-5" />} tone="sky" label="เบิกวันนี้"
                value={formatNumber(d.todayCount)} hint="จำนวนครั้งที่เบิกสำเร็จ" />
              <StatCard icon={<PackageCheck className="w-5 h-5" />} tone="violet" label="เบิกเดือนนี้"
                value={formatNumber(d.monthUnits)} hint="จำนวนชิ้นที่ถูกเบิกออกไป" />
            </div>

            {/* 2) Stock health bar */}
            <Card title="ภาพรวมสถานะสต็อก" subtitle="สินค้าแต่ละรายการอยู่ในสถานะไหน">
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                <div className="bg-emerald-500" style={{ width: `${(d.ok.length / total) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${(d.low.length / total) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${(d.out.length / total) * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600"><i className="w-2.5 h-2.5 rounded-full bg-emerald-500" />ปกติ <b className="text-slate-900">{d.ok.length}</b></span>
                <span className="flex items-center gap-2 text-slate-600"><i className="w-2.5 h-2.5 rounded-full bg-amber-400" />ใกล้หมด <b className="text-slate-900">{d.low.length}</b></span>
                <span className="flex items-center gap-2 text-slate-600"><i className="w-2.5 h-2.5 rounded-full bg-red-500" />หมดแล้ว <b className="text-slate-900">{d.out.length}</b></span>
              </div>
            </Card>

            <div className="grid lg:grid-cols-2 gap-5">
              {/* 3) Need restock */}
              <Card title="สินค้าที่ควรเติมของ" subtitle="เรียงจากที่เหลือน้อยที่สุดก่อน">
                {d.needRestock.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">
                    <CheckCircle2 className="w-4 h-4" /> ตอนนี้ของทุกอย่างพอใช้ ยังไม่ต้องเติม
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {d.needRestock.slice(0, 6).map((p) => {
                      const out = p.quantity <= 0;
                      const pct = Math.min(100, (p.quantity / Math.max(1, p.lowStockThreshold)) * 100);
                      return (
                        <li key={p.id}>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-slate-800 truncate">{p.name}</span>
                            <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${out ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {out ? "หมดแล้ว" : `เหลือ ${formatNumber(p.quantity)} ${p.unit}`}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
                            <div className={out ? "bg-red-500 h-full" : "bg-amber-400 h-full"} style={{ width: `${Math.max(pct, out ? 0 : 4)}%` }} />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">ควรมีอย่างน้อย {formatNumber(p.lowStockThreshold)} {p.unit}</p>
                        </li>
                      );
                    })}
                    {d.needRestock.length > 6 && (
                      <li className="text-xs text-slate-400">และอีก {d.needRestock.length - 6} รายการ ดูทั้งหมดที่เมนูสินค้า</li>
                    )}
                  </ul>
                )}
              </Card>

              {/* 4) Top requested */}
              <Card title="ของที่ถูกเบิกบ่อย" subtitle="นับจำนวนชิ้นใน 30 วันที่ผ่านมา">
                {d.top.length === 0 ? (
                  <p className="text-sm text-slate-400">ยังไม่มีการเบิกในช่วงนี้</p>
                ) : (
                  <ol className="space-y-3">
                    {d.top.map(([name, qty], i) => (
                      <li key={name}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 flex items-center justify-center shrink-0">{i + 1}</span>
                            <span className="font-medium text-slate-800 truncate">{name}</span>
                          </span>
                          <span className="font-bold text-slate-900 shrink-0">{formatNumber(qty)} ชิ้น</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${(qty / maxTop) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>

            <div className="grid lg:grid-cols-5 gap-5">
              {/* 5) 7-day activity */}
              <div className="lg:col-span-2">
                <Card title="การเบิก 7 วันล่าสุด" subtitle="จำนวนครั้งที่เบิกในแต่ละวัน · เอาเมาส์ชี้แท่งเพื่อดูรายชื่อ">
                  <div className="flex items-end justify-between gap-2 h-36">
                    {d.days.map((x, i) => (
                      <div key={x.key} className="group relative flex-1 flex flex-col items-center justify-end h-full gap-1.5">
                        <span className="text-xs font-semibold text-slate-600">{x.count || ""}</span>
                        <div
                          className={`w-full rounded-t-md cursor-default ${i === 6 ? "bg-emerald-500 group-hover:bg-emerald-600" : "bg-emerald-200 group-hover:bg-emerald-300"}`}
                          style={{ height: `${Math.max((x.count / maxDay) * 100, x.count ? 8 : 3)}%` }}
                        />
                        <span className={`text-[11px] ${i === 6 ? "font-bold text-emerald-700" : "text-slate-400"}`}>{i === 6 ? "วันนี้" : x.label}</span>

                        {x.items.length > 0 && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-52">
                            <div className="bg-slate-900 text-white text-xs rounded-lg shadow-lg p-2.5 max-h-48 overflow-y-auto">
                              <p className="font-semibold mb-1.5 text-slate-200">
                                {x.label} {x.date} · {x.items.length} รายการ
                              </p>
                              <ul className="space-y-1">
                                {x.items.map((it, idx) => (
                                  <li key={idx} className="flex justify-between gap-2">
                                    <span className="truncate">{it.userName}</span>
                                    <span className="text-slate-300 shrink-0">
                                      {it.productName} x{it.quantity}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="w-2 h-2 bg-slate-900 rotate-45 mx-auto -mt-1" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* 6) Recent activity */}
              <div className="lg:col-span-3">
                <Card title="การเบิกล่าสุด" subtitle="8 รายการล่าสุด">
                  {d.recent.length === 0 ? (
                    <p className="text-sm text-slate-400">ยังไม่มีการเบิก</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 -my-2">
                      {d.recent.map((l) => {
                        const failed = l.status === "FAILED";
                        return (
                          <li key={l.id} className="py-3 flex items-start gap-3">
                            <span className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${failed ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
                              {failed ? <XCircle className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                            </span>
                            <div className="min-w-0 flex-1 text-sm">
                              <p className="text-slate-800">
                                <b>{l.userName}</b> {failed ? "พยายามเบิก" : "เบิก"}{" "}
                                <b>{l.productName}</b> {formatNumber(l.quantityRequested)} ชิ้น
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {timeAgo(l.createdAt)}
                                {l.isOnboarding
                                  ? ` · ชุดพนักงานใหม่${l.employeeName ? ` (${l.employeeName})` : ""}`
                                  : l.isActivity
                                  ? ` · เบิกสำหรับกิจกรรม${l.employeeName ? ` (${l.employeeName})` : ""}`
                                  : l.eventName
                                  ? ` · ${l.eventName}`
                                  : ""}
                                {failed && " · ของในคลังไม่พอ"}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}