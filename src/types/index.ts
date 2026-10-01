export type Role = "Staff" | "Admin" | "Admin2";

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export type EmployeeStatus = "PENDING" | "ONBOARDED";

export type RequisitionStatus = "SUCCESS" | "FAILED" | "PARTIAL";

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  password: string; // hashed in production, plain for Sheets simplicity as per spec (Admin sets plain)
  role: Role;
  status: UserStatus;
  employeeId: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unit: string;
  category: string;
  lowStockThreshold: number;
  updatedAt: string;
  version: number;
}

export interface RequisitionLog {
  id: string;
  userId: string;
  userName: string;
  productId: string;
  productName: string;
  quantityRequested: number;
  quantityBefore: number;
  quantityAfter: number;
  eventName: string;
  status: RequisitionStatus;
  isOnboarding: boolean;
  bundleId: string;
  employeeId: string;
  employeeName: string;
  createdAt: string;
  // Total quantity of this requisition that has since been returned to stock.
  // 0 <= returnedQuantity <= quantityRequested.
  returnedQuantity: number;
  // Timestamp of the most recent return against this requisition (ISO string).
  // Empty/undefined if nothing has been returned yet.
  returnedAt?: string;
  // หมายเหตุ (free text) typed next to the Event category on a general requisition.
  note: string;
  // true = เบิกสำหรับกิจกรรม (given to an employee for an activity/event).
  // These are never returned, so they are hidden from the return pages.
  isActivity: boolean;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetUserId: string;
  detail: string;
  createdAt: string;
}

export interface OnboardingBundle {
  id: string;
  bundleName: string;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export interface OnboardingBundleItem {
  id: string;
  bundleId: string;
  productId: string;
  productName: string;
  quantityPerSet: number;
}

// Newcomer (พนักงานใหม่) record — synced in from an external Google Sheet
// ("Data Newcomer") that the Admin2 team maintains. This is completely
// separate from the Users sheet: creating a login account does NOT create
// one of these, and vice versa.
export interface Employee {
  id: string;
  employeeId: string; // internal id, auto-generated, used to track onboarding requisitions
  order: string; // ลำดับ
  company: string; // บริษัท
  month: string; // เดือน
  startDate: string; // วันที่เริ่มงาน
  fullName: string; // รายชื่อพนักงาน
  position: string; // ตำแหน่ง
  department: string; // หน่วยงาน
  cLevel: string; // C Level (optional column in the source sheet)
  status: EmployeeStatus; // PENDING = ยังไม่ได้รับของ, ONBOARDED = ได้รับของแล้ว
  createdAt: string;
}

// Per-newcomer, per-product onboarding status (used by the
// "ฐานข้อมูลพนักงานใหม่" table). Derived from RequisitionLog rows.
export type ItemReceiveState = "RECEIVED" | "PENDING" | "NA"; // NA = not part of this person's bundle
export type OverallReceiveState = "COMPLETE" | "PARTIAL" | "NONE";
export type ItemSource = "ONBOARDING" | "ACTIVITY";

export interface EmployeeItemStatusResult {
  // One table column per product (bundle items + anything actually withdrawn)
  columns: { productId: string; productName: string }[];
  // Keyed by Employee.employeeId
  employees: Record<
    string,
    {
      items: Record<string, ItemReceiveState>;
      // Only the products the admin actually picked for this person (in the
      // onboarding requisition). Products that weren't picked never appear.
      // source = ONBOARDING (ชุดพนักงานใหม่, green) | ACTIVITY (เบิกสำหรับกิจกรรม, orange).
      selected: {
        productId: string;
        productName: string;
        received: boolean;
        source: ItemSource;
      }[];
      // true when this person has at least one onboarding-kit withdrawal.
      // (Activity-only people keep the roster's own status for "overall".)
      hasOnboarding: boolean;
      overall: OverallReceiveState;
      // Who withdrew and when (latest successful onboarding withdrawal).
      requestedBy?: string;
      requestedAt?: string; // ISO timestamp
    }
  >;
}

// Session user (without password)
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  employeeId: string;
}

// Form / request types
export interface RequisitionRequest {
  productId: string;
  quantity: number;
  eventName: string; // Event category picked from the Config sheet
  note?: string; // หมายเหตุ
}

export interface ActivityRequisitionRequest {
  employeeId: string;
  items: { productId: string; quantity: number }[];
}

export interface OnboardingRequisitionRequest {
  bundleId: string;
  employeeId: string;
  allowPartial?: boolean;
  items?: { productId: string; quantity: number }[];
}

export interface ReturnRequisitionRequest {
  logId: string;
  quantity: number;
}

export interface ImportNewcomersRequest {
  sheetUrl: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  username: string;
  password: string;
  role: Role;
  employeeId: string;
  fullName: string;
  department: string;
  position: string;
  startDate: string;
}

export interface ProductFormData {
  name: string;
  imageUrl?: string;
  quantity: number;
  unit: string;
  category: string;
  lowStockThreshold: number;
}