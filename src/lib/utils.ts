import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// วันที่เริ่มงานจากชีต Data Newcomer มาเป็นข้อความรูปแบบ d/m/yyyy (เช่น "9/11/2026")
// แต่ <input type="date"> ให้ค่าเป็น "YYYY-MM-DD" → เทียบเป็น string ตรงๆ ไม่ได้.
// แปลงทุกรูปแบบที่เจอให้เป็น "YYYY-MM-DD" (ปี พ.ศ. > 2400 จะลบ 543 ให้).
// คืน "" ถ้าอ่านไม่ออก.
export function toIsoDate(raw: string | undefined | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const fixYear = (y: number) => (y < 100 ? 2000 + y : y > 2400 ? y - 543 : y);

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); // yyyy-mm-dd
  if (m) return `${fixYear(+m[1])}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); // d/m/yyyy
  if (m) return `${fixYear(+m[3])}-${pad(+m[2])}-${pad(+m[1])}`;
  return "";
}

// วันนี้ตามเวลาเครื่อง (ไม่ใช่ UTC) ในรูปแบบ "YYYY-MM-DD"
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// true ถ้า startDate อยู่ในช่วง [from, to] (from/to = "YYYY-MM-DD" หรือว่าง)
export function inDateRange(startDate: string, from?: string | null, to?: string | null): boolean {
  if (!from && !to) return true;
  const d = toIsoDate(startDate);
  if (!d) return false;
  return (!from || d >= from) && (!to || d <= to);
}

// ใช้กับ .sort() — วันที่เริ่มงานใหม่สุดขึ้นก่อน
export function byStartDateDesc(a: { startDate: string }, b: { startDate: string }): number {
  const x = toIsoDate(a.startDate);
  const y = toIsoDate(b.startDate);
  return x === y ? 0 : x < y ? 1 : -1;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("th-TH").format(n);
}
