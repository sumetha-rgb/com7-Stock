"use client";

import { EmployeeDatabaseView } from "@/components/EmployeeDatabaseView";

// Staff (and Admin) see the roster + export only. No link-paste / import panel,
// and the import API itself is still Admin2-only on the server.
export default function StaffEmployeeDatabasePage() {
  return <EmployeeDatabaseView canImport={false} />;
}