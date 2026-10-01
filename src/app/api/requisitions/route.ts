import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  deductStock,
  deductStockBatch,
  getRequisitionLogs,
  getBundleItems,
  getProducts,
  getEventCategories,
  getEmployees,
  getEmployeeByEmployeeId,
  updateEmployeeStatus,
  returnStockItem,
} from "@/lib/sheets";
import {
  notifyRequisitionSuccess,
  notifyInsufficientStock,
  notifyOnboardingSuccess,
  notifyBatchSummary,
} from "@/lib/notifications";
import { runInBackground } from "@/lib/background";
import type { SessionUser } from "@/types";

// This route reflects live stock/requisition data straight from Google
// Sheets (return status, quantities, etc). Never let Next.js or the
// browser cache a GET here, or the returns pages will show stale data
// right after a return is submitted.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as SessionUser;
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "true";

  try {
    const logs = await getRequisitionLogs(
      mine ? { userId: user.id } : user.role === "Staff" ? { userId: user.id } : undefined
    );
    return NextResponse.json(logs, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "ไม่สามารถโหลดประวัติได้ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as SessionUser;

  try {
    const body = await req.json();
    const { mode } = body; // "general" | "onboarding" | "return"

    if (mode === "return") {
      const { logId, quantity } = body;
      if (!logId || !quantity || quantity <= 0) {
        return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
      }

      // Staff can only return items they themselves withdrew; Admin/Admin2
      // can return on behalf of anyone (e.g. processing a return in person).
      if (user.role === "Staff") {
        const allLogs = await getRequisitionLogs();
        const target = allLogs.find((l) => l.id === logId);
        if (!target || target.userId !== user.id) {
          return NextResponse.json(
            { success: false, error: "คุณคืนได้เฉพาะของที่ตัวเองเบิกเท่านั้น" },
            { status: 403 }
          );
        }
      }

      const result = await returnStockItem(logId, Number(quantity), {
        userId: user.id,
        userName: user.name,
      });

      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true, log: result.log, product: result.product });
    }

    if (mode === "general") {
      const { productId, quantity, eventName } = body;
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
      if (!productId || !quantity || quantity <= 0 || !eventName?.trim()) {
        return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
      }

      // Event must be one of the categories in the Config sheet (no free text).
      let categories: string[];
      try {
        categories = await getEventCategories();
      } catch (e) {
        console.error("Event categories load failed:", e);
        return NextResponse.json(
          { error: "โหลดหมวดหมู่ Event จากชีท Config ไม่สำเร็จ กรุณาลองใหม่" },
          { status: 503 }
        );
      }
      if (!categories.includes(eventName.trim())) {
        return NextResponse.json({ error: "หมวดหมู่ Event ไม่ถูกต้อง กรุณาเลือกจากรายการ" }, { status: 400 });
      }

      const result = await deductStock(productId, Number(quantity), {
        userId: user.id,
        userName: user.name,
        eventName: eventName.trim(),
        note,
      });

      if (!result.success) {
        if (result.currentQty !== undefined) {
          const available = result.currentQty;
          const failedProductName = result.log?.productName || productId;
          runInBackground(() =>
            notifyInsufficientStock({
              userName: user.name,
              productName: failedProductName,
              requested: quantity,
              available,
            })
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            currentQty: result.currentQty,
          },
          { status: 400 }
        );
      }

      const successLog = result.log!;
      const trimmedEvent = eventName.trim();
      runInBackground(() =>
        notifyRequisitionSuccess({
          userName: user.name,
          productName: successLog.productName,
          quantity,
          eventName: trimmedEvent,
          note,
          remaining: successLog.quantityAfter,
        })
      );

      return NextResponse.json({ success: true, log: result.log });
    }

    // One LINE summary for a whole batch. The page withdraws person by person
    // (notify:false on each), then calls this once with everyone who succeeded.
    if (mode === "notify-summary") {
      const { kind } = body;
      const people: { employeeId: string; items: { productId: string; quantity: number }[] }[] =
        Array.isArray(body.people) ? body.people.slice(0, 500) : [];
      const failedIn: { name: string; error: string }[] = Array.isArray(body.failed) ? body.failed.slice(0, 100) : [];
      if ((kind !== "onboarding" && kind !== "activity") || people.length === 0) {
        return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
      }

      const [emps, prods] = await Promise.all([getEmployees(), getProducts()]);
      const empById = new Map(emps.map((e) => [e.employeeId, e]));
      const prodById = new Map(prods.map((p) => [p.id, p]));

      const peopleOut: { name: string; employeeId: string }[] = [];
      // productId -> { total, perPersonQtys }
      const agg = new Map<string, { total: number; qtys: Set<number>; people: number }>();
      for (const p of people) {
        const emp = empById.get(String(p.employeeId));
        if (!emp) continue;
        peopleOut.push({ name: emp.fullName, employeeId: emp.employeeId });
        for (const it of Array.isArray(p.items) ? p.items : []) {
          const q = Math.floor(Number(it?.quantity));
          if (!prodById.has(String(it?.productId)) || !Number.isFinite(q) || q <= 0) continue;
          const cur = agg.get(it.productId) || { total: 0, qtys: new Set<number>(), people: 0 };
          cur.total += q;
          cur.qtys.add(q);
          cur.people += 1;
          agg.set(it.productId, cur);
        }
      }
      if (peopleOut.length === 0) {
        return NextResponse.json({ error: "ไม่พบพนักงาน" }, { status: 404 });
      }
      const itemsOut = [...agg.entries()].map(([productId, a]) => ({
        name: prodById.get(productId)?.name || productId,
        total: a.total,
        // "คนละ N" only when everyone got the same amount of this product
        perPerson: a.qtys.size === 1 && a.people === peopleOut.length ? [...a.qtys][0] : null,
      }));
      const failedOut = failedIn
        .filter((f) => f && typeof f.name === "string")
        .map((f) => ({ name: String(f.name).slice(0, 80), error: String(f.error || "เบิกไม่สำเร็จ").slice(0, 120) }));

      runInBackground(() =>
        notifyBatchSummary({
          kind,
          requestedBy: user.name,
          people: peopleOut,
          items: itemsOut,
          failed: failedOut,
        })
      );
      return NextResponse.json({ success: true });
    }

    // เบิกสำหรับกิจกรรม: give any products to an employee (new or already
    // onboarded, repeat withdrawals allowed). Logged as isActivity - never
    // returned, never changes the employee's onboarding status.
    if (mode === "activity") {
      const { employeeId, items: clientItems } = body;
      if (!employeeId || !Array.isArray(clientItems)) {
        return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
      }
      const employee = await getEmployeeByEmployeeId(employeeId);
      if (!employee) {
        return NextResponse.json({ error: "ไม่พบพนักงาน" }, { status: 404 });
      }

      const merged = new Map<string, number>();
      for (const ci of clientItems) {
        if (ci && typeof ci.productId === "string" && Number.isFinite(ci.quantity)) {
          const q = Math.max(0, Math.floor(ci.quantity));
          merged.set(ci.productId, (merged.get(ci.productId) || 0) + q);
        }
      }
      const items = [...merged.entries()]
        .map(([productId, quantity]) => ({ productId, quantity }))
        .filter((i) => i.quantity > 0);
      if (!items.length) {
        return NextResponse.json({ error: "ไม่มีรายการที่จะเบิก" }, { status: 400 });
      }

      const result = await deductStockBatch(
        items,
        {
          userId: user.id,
          userName: user.name,
          eventName: `เบิกสำหรับกิจกรรม - ${employee.fullName} (${employee.employeeId})`,
          isOnboarding: false,
          isActivity: true,
          bundleId: "",
          employeeId: employee.employeeId,
          employeeName: employee.fullName,
        },
        false
      );
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error, results: result.results },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, results: result.results });
    }

    if (mode === "onboarding") {
      const { bundleId, employeeId, allowPartial, items: clientItems } = body;
      if (!bundleId || !employeeId) {
        return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
      }

      // Independent reads run together. The employee is read fresh (not from
      // cache) because the "already onboarded" check below must be exact.
      const [employee, bundleItems, allProducts] = await Promise.all([
        getEmployeeByEmployeeId(employeeId, true),
        getBundleItems(bundleId),
        getProducts(),
      ]);
      if (!employee) {
        return NextResponse.json({ error: "ไม่พบพนักงาน" }, { status: 404 });
      }

      if (employee.status === "ONBOARDED" && !body.force) {
        return NextResponse.json(
          {
            success: false,
            error: "พนักงานคนนี้เคยเบิกของพนักงานใหม่ไปแล้ว",
            alreadyOnboarded: true,
          },
          { status: 400 }
        );
      }

      // The bundle is only a default. When the client sends an explicit item
      // list, that list is what gets withdrawn - any product, any quantity
      // (0 = skipped, less than the bundle default is fine, products outside
      // the bundle are allowed). Only when no list is sent do we fall back
      // to the bundle defaults.
      let items: { productId: string; quantity: number }[] = [];
      if (Array.isArray(clientItems)) {
        const merged = new Map<string, number>();
        for (const ci of clientItems) {
          if (ci && typeof ci.productId === "string" && Number.isFinite(ci.quantity)) {
            const q = Math.max(0, Math.floor(ci.quantity));
            merged.set(ci.productId, (merged.get(ci.productId) || 0) + q);
          }
        }
        items = [...merged.entries()]
          .map(([productId, quantity]) => ({ productId, quantity }))
          .filter((i) => i.quantity > 0);
      } else {
        if (!bundleItems.length) {
          return NextResponse.json({ error: "ชุดนี้ไม่มีสินค้า" }, { status: 400 });
        }
        items = bundleItems.map((i) => ({ productId: i.productId, quantity: i.quantityPerSet }));
      }

      if (!items.length) {
        return NextResponse.json({ error: "ไม่มีรายการที่จะเบิก" }, { status: 400 });
      }

      const eventName = `Onboarding - ${employee.fullName} (${employee.employeeId})`;

      const result = await deductStockBatch(
        items,
        {
          userId: user.id,
          userName: user.name,
          eventName,
          isOnboarding: true,
          bundleId,
          employeeId: employee.employeeId,
          employeeName: employee.fullName,
        },
        !!allowPartial
      );

      if (!result.success && !allowPartial) {
        return NextResponse.json(
          { success: false, error: result.error, results: result.results },
          { status: 400 }
        );
      }

      // Mark employee as ONBOARDED if at least one success
      if (result.results.some((r) => r.success)) {
        await updateEmployeeStatus(employee.employeeId, "ONBOARDED");
        const successItems = result.results
          .filter((r) => r.success)
          .map((r) => {
            const name =
              allProducts.find((p) => p.id === r.productId)?.name ||
              bundleItems.find((i) => i.productId === r.productId)?.productName ||
              r.productId;
            const qty = items.find((i) => i.productId === r.productId)?.quantity ?? 1;
            return { name, qty };
          });
        // notify:false = part of a multi-person batch; the page sends ONE
        // summary afterwards (mode "notify-summary") instead of a card each.
        if (body.notify !== false) runInBackground(() =>
          notifyOnboardingSuccess({
          employeeName: employee.fullName,
          employeeId: employee.employeeId,
          department: employee.department,
          position: employee.position,
          startDate: employee.startDate,
          requestedBy: user.name,
          items: successItems,
          })
        );
      }

      return NextResponse.json({
        success: result.success,
        results: result.results,
        error: result.error,
      });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (e) {
    console.error("Requisition error:", e);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ กรุณาลองใหม่ภายหลัง" },
      { status: 500 }
    );
  }
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;