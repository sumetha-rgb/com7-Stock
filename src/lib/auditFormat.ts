import type { AuditLog } from "@/types";

export type AuditTone = "create" | "update" | "delete" | "other";

export interface AuditView {
  title: string; // หัวข้อที่คนอ่านเข้าใจ
  tone: AuditTone;
  target: string; // ชื่อผู้ถูกดำเนินการ (ไม่ใช่ id)
  summary: string; // ประโยคสรุปสั้นๆ
  changes: { label: string; text: string }[]; // รายการที่แก้ไข (ถ้ามี)
}

const ROLE_LABEL: Record<string, string> = {
  Staff: "พนักงานทั่วไป",
  Admin: "แอดมิน (ดูแลสต็อก)",
  Admin2: "ผู้ดูแลระบบ",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้งานได้",
  SUSPENDED: "ระงับการใช้งาน",
  DELETED: "ลบแล้ว",
};

const FIELD_LABEL: Record<string, string> = {
  name: "ชื่อ-นามสกุล",
  email: "อีเมล",
  username: "ชื่อผู้ใช้ (Username)",
  password: "รหัสผ่าน",
  role: "สิทธิ์การใช้งาน",
  status: "สถานะบัญชี",
};

const roleText = (v: string) => ROLE_LABEL[v] ?? v;
const statusText = (v: string) => STATUS_LABEL[v] ?? v;

function valueText(field: string, v: unknown): string {
  const s = String(v ?? "");
  if (field === "role") return roleText(s);
  if (field === "status") return statusText(s);
  return s || "-";
}

/**
 * แปลงข้อมูล audit log ดิบ ให้เป็นข้อความภาษาไทยที่คนทั่วไปอ่านเข้าใจ
 * - ไม่แสดงรหัสผ่านเด็ดขาด (แม้ log เก่าจะเก็บไว้เป็นข้อความธรรมดา)
 * - ไม่แสดง UUID ให้ผู้ใช้เห็น ใช้ชื่อผู้ใช้แทน
 * @param userNames  map ของ userId -> ชื่อที่แสดง (ถ้ามี)
 */
export function formatAuditLog(log: AuditLog, userNames: Record<string, string> = {}): AuditView {
  const detail = log.detail || "";
  const mapped = userNames[log.targetUserId];

  switch (log.action) {
    case "CREATE_USER": {
      const m = detail.match(/Created user (\S+)(?: \+ employee (\S+))?(?: role=(\S+))?/);
      const username = m?.[1];
      const empId = m?.[2];
      const role = m?.[3];
      const target = username || mapped || "ผู้ใช้ใหม่";
      const parts = [`สร้างบัญชีผู้ใช้ "${target}"`];
      if (empId) parts.push(`รหัสพนักงาน ${empId}`);
      if (role) parts.push(`สิทธิ์: ${roleText(role)}`);
      return {
        title: "เพิ่มผู้ใช้งานใหม่",
        tone: "create",
        target,
        summary: parts.join(" • "),
        changes: [],
      };
    }

    case "DELETE_USER": {
      const m = detail.match(/Deleted user (\S+)(?: \(employeeId: ([^)]+)\))?/);
      const username = m?.[1];
      const empId = m?.[2] && m[2] !== "-" ? m[2] : undefined;
      const target = username || mapped || "ผู้ใช้ที่ถูกลบ";
      return {
        title: "ลบผู้ใช้งาน",
        tone: "delete",
        target,
        summary: `ลบบัญชี "${target}"${empId ? ` (รหัสพนักงาน ${empId})` : ""} ออกจากระบบ`,
        changes: [],
      };
    }

    case "UPDATE_USER": {
      let obj: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(detail);
        if (parsed && typeof parsed === "object") obj = parsed;
      } catch {
        /* ข้อความที่ไม่ใช่ JSON */
      }
      const changes: AuditView["changes"] = [];
      for (const [field, raw] of Object.entries(obj)) {
        const label = FIELD_LABEL[field] ?? field;
        if (field === "password") {
          changes.push({ label, text: "เปลี่ยนรหัสผ่านใหม่แล้ว" });
          continue;
        }
        // รูปแบบใหม่: { from, to }   รูปแบบเก่า: ค่าเดี่ยว
        if (raw && typeof raw === "object" && "to" in (raw as object)) {
          const { from, to } = raw as { from?: unknown; to?: unknown };
          changes.push({
            label,
            text: `${valueText(field, from)} → ${valueText(field, to)}`,
          });
        } else {
          changes.push({ label, text: `เป็น ${valueText(field, raw)}` });
        }
      }
      const target = (typeof obj.username === "string" && obj.username) || mapped || "ผู้ใช้งาน";
      return {
        title: "แก้ไขข้อมูลผู้ใช้งาน",
        tone: "update",
        target,
        summary: changes.length
          ? `แก้ไขข้อมูลของ "${target}" ดังนี้`
          : `แก้ไขข้อมูลของ "${target}"`,
        changes,
      };
    }

    case "RETURN_ITEM":
      return {
        title: "คืนของเข้าคลัง",
        tone: "update",
        target: mapped || "-",
        summary: detail,
        changes: [],
      };

    default:
      return {
        title: log.action,
        tone: "other",
        target: mapped || "-",
        summary: detail,
        changes: [],
      };
  }
}