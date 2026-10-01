"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import type { AuditLog } from "@/types";
import { formatDate } from "@/lib/utils";
import { formatAuditLog, type AuditTone } from "@/lib/auditFormat";
import { HopLoader } from "@/components/HopLoader";
import { UserPlus, UserCog, UserMinus, FileText } from "lucide-react";

const TONE_STYLE: Record<AuditTone, { icon: React.ReactNode; badge: string; title: string }> = {
  create: {
    icon: <UserPlus className="w-4 h-4" />,
    badge: "bg-emerald-100 text-emerald-700",
    title: "text-emerald-800",
  },
  update: {
    icon: <UserCog className="w-4 h-4" />,
    badge: "bg-sky-100 text-sky-700",
    title: "text-sky-800",
  },
  delete: {
    icon: <UserMinus className="w-4 h-4" />,
    badge: "bg-red-100 text-red-700",
    title: "text-red-800",
  },
  other: {
    icon: <FileText className="w-4 h-4" />,
    badge: "bg-slate-100 text-slate-600",
    title: "text-slate-800",
  },
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      fetch("/api/audit", { signal: ctrl.signal }).then((r) => r.json()),
      // ใช้แปลง id ของผู้ใช้ให้เป็นชื่อ (ถ้าโหลดไม่ได้ก็ข้ามไป)
      fetch("/api/users", { signal: ctrl.signal })
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([audit, users]) => {
        setLogs(Array.isArray(audit) ? audit : []);
        const map: Record<string, string> = {};
        if (Array.isArray(users)) {
          for (const u of users) map[u.id] = u.username || u.name;
        }
        setUserNames(map);
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">ประวัติการแก้ไขระบบ</h1>
        <p className="text-sm text-slate-500 mb-4">
          บันทึกว่าใครเพิ่ม แก้ไข หรือลบผู้ใช้งาน และเมื่อไหร่ (ใหม่สุดอยู่บนสุด)
        </p>
        {loading ? (
          <HopLoader />
        ) : (
          <div className="bg-white border rounded-xl divide-y shadow-sm">
            {logs.map((log) => {
              const v = formatAuditLog(log, userNames);
              const style = TONE_STYLE[v.tone];
              return (
                <div key={log.id} className="px-4 py-3.5 flex gap-3">
                  <span
                    className={`mt-0.5 flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${style.badge}`}
                  >
                    {style.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-x-3">
                      <span className={`font-semibold text-sm ${style.title}`}>{v.title}</span>
                      <span className="text-xs text-slate-400">{formatDate(log.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-0.5">{v.summary}</p>
                    {v.changes.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {v.changes.map((c) => (
                          <li
                            key={c.label}
                            className="text-xs bg-slate-100 text-slate-600 rounded-md px-2 py-1 break-all"
                          >
                            <span className="font-medium text-slate-700">{c.label}:</span> {c.text}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-slate-400 mt-1.5">ดำเนินการโดย {log.actorName}</p>
                  </div>
                </div>
              );
            })}
            {logs.length === 0 && <p className="p-4 text-slate-400 text-sm">ยังไม่มีประวัติ</p>}
          </div>
        )}
      </main>
    </div>
  );
}