"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Nav } from "@/components/Nav";
import toast from "react-hot-toast";
import type { Product, OnboardingBundle, OnboardingBundleItem, Employee } from "@/types";
import { formatNumber } from "@/lib/utils";
import { HopLoader } from "@/components/HopLoader";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";
import { Package, Search, Minus, Plus, X, UserRound, CalendarClock, CheckCircle2 } from "lucide-react";

type Mode = "general" | "onboarding" | "stock" | "activity";

// The ชุด used by "เบิกสำหรับกิจกรรม" is the Onboarding bundle whose name
// contains "กิจกรรม" (or "activity"). Only that bundle is shown in the
// activity tab, and it is hidden from the normal onboarding tab.
const isActivityBundle = (b: { bundleName: string }) => /กิจกรรม|activity/i.test(b.bundleName);

export default function RequisitionPage() {
  const [mode, setMode] = useState<Mode>("general");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // General — overview grid + modal
  const [search, setSearch] = useState("");
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [eventName, setEventName] = useState("");
  const [note, setNote] = useState("");
  // Event categories come from the Config sheet (column "Event").
  const [eventCategories, setEventCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // เบิกสำหรับกิจกรรม
  const [actSearch, setActSearch] = useState("");
  const [actItemSearch, setActItemSearch] = useState("");
  const [actSelected, setActSelected] = useState<Employee[]>([]);
  const [actQty, setActQty] = useState<Record<string, number>>({});
  const [actFromDate, setActFromDate] = useState("");
  const [actToDate, setActToDate] = useState("");
  // Items of the activity bundle(s) only (product + default qty from the bundle)
  const [actBundleItems, setActBundleItems] = useState<
    { productId: string; productName: string; defaultQty: number }[]
  >([]);
  const [actBundleLoading, setActBundleLoading] = useState(false);
  const [actBundleFound, setActBundleFound] = useState(true);
  const [showActConfirm, setShowActConfirm] = useState(false);

  // Onboarding
  const [bundles, setBundles] = useState<OnboardingBundle[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState("");
  const [bundleItems, setBundleItems] = useState<OnboardingBundleItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [empFromDate, setEmpFromDate] = useState("");
  const [empToDate, setEmpToDate] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [resultPopup, setResultPopup] = useState<{
    items: { productName: string; quantity: number }[];
    succeeded: Employee[];
    failed: { emp: Employee; error: string }[];
  } | null>(null);
  // Pre-submit summary popup: shown when staff clicks the main confirm
  // button, before anything is actually submitted. The system only runs
  // once the person confirms again from inside this popup.
  const [showConfirmSummary, setShowConfirmSummary] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (res.ok) setProducts(await res.json());
    } catch {
      toast.error("โหลดสินค้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch("/api/event-categories", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.categories)) {
        setEventCategories(data.categories);
      } else {
        toast.error(data.error || "โหลดหมวดหมู่ Event ไม่สำเร็จ");
      }
    } catch {
      toast.error("โหลดหมวดหมู่ Event ไม่สำเร็จ");
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Activity mode searches the WHOLE roster (incl. people who already got
  // their onboarding kit), so load employees when the tab is opened.
  useEffect(() => {
    if (mode !== "activity") return;
    fetch("/api/employees", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => toast.error("โหลดรายชื่อพนักงานไม่สำเร็จ"));

    // Only the activity bundle's items are offered (other bundles never show).
    let cancelled = false;
    setActBundleLoading(true);
    loadProducts();
    fetch("/api/bundles?include=items", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list: { bundle: OnboardingBundle; items: OnboardingBundleItem[] }[] = Array.isArray(data)
          ? data.filter((x) => isActivityBundle(x.bundle))
          : [];
        setActBundleFound(list.length > 0);
        const merged = new Map<string, { productId: string; productName: string; defaultQty: number }>();
        for (const { items } of list) {
          for (const it of items) {
            if (!merged.has(it.productId)) {
              merged.set(it.productId, {
                productId: it.productId,
                productName: it.productName,
                defaultQty: it.quantityPerSet,
              });
            }
          }
        }
        setActBundleItems([...merged.values()]);
      })
      .catch(() => {
        if (!cancelled) {
          setActBundleItems([]);
          toast.error("โหลดชุดเบิกสำหรับกิจกรรมไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) setActBundleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, loadProducts]);

  useEffect(() => {
    if (mode === "onboarding") {
      fetch("/api/bundles")
        .then((r) => r.json())
        .then((data) => {
          const active = (data || []).filter(
            (b: OnboardingBundle) => b.isActive && !isActivityBundle(b)
          );
          setBundles(active);
          if (active.length === 1) setSelectedBundleId(active[0].id);
        })
        .catch(() => {});
      fetch("/api/employees")
        .then((r) => r.json())
        .then(setEmployees)
        .catch(() => {});
    }
  }, [mode]);

  // View-only "check onboarding stock": every active bundle with its items,
  // re-read from the sheet each time the tab is opened so edits to a bundle
  // (add / remove / change quantity) show up right away. Stock numbers come
  // from the live products list.
  const [stockBundles, setStockBundles] = useState<
    { bundle: OnboardingBundle; items: OnboardingBundleItem[] }[]
  >([]);
  const [stockLoading, setStockLoading] = useState(false);

  useEffect(() => {
    if (mode !== "stock") return;
    let cancelled = false;
    setStockLoading(true);
    loadProducts();
    (async () => {
      try {
        // One request returns every active bundle with its items.
        const res = await fetch("/api/bundles?include=items", { cache: "no-store" });
        const data = await res.json();
        const withItems: { bundle: OnboardingBundle; items: OnboardingBundleItem[] }[] =
          Array.isArray(data) ? data : [];
        if (!cancelled) setStockBundles(withItems);
      } catch {
        if (!cancelled) {
          setStockBundles([]);
          toast.error("โหลดข้อมูลชุดพนักงานใหม่ไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, loadProducts]);

  useEffect(() => {
    if (selectedBundleId) {
      fetch(`/api/bundles?bundleId=${selectedBundleId}`)
        .then((r) => r.json())
        .then((data) => setBundleItems(data.items || data || []))
        .catch(() => setBundleItems([]));
    }
  }, [selectedBundleId]);

  // Seed each product's requested quantity. The bundle is only a starting
  // point: bundle items start at their default amount (capped to stock),
  // every other product starts at 0. Staff can change any of them freely,
  // including adding products that are not in the bundle at all.
  useEffect(() => {
    if (!selectedBundleId) {
      setItemQty({});
      return;
    }
    setItemQty(() => {
      const next: Record<string, number> = {};
      for (const p of products) next[p.id] = 0;
      for (const item of bundleItems) {
        const stock = products.find((p) => p.id === item.productId)?.quantity ?? 0;
        next[item.productId] = Math.min(item.quantityPerSet, stock);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleItems, selectedBundleId]);

  // Search box for the onboarding item list
  const [itemSearch, setItemSearch] = useState("");

  // Bundle items first (in bundle order), then every other product.
  const onboardingList = useMemo(() => {
    const inBundle = new Set(bundleItems.map((b) => b.productId));
    const bundlePart = bundleItems.map((b) => ({
      productId: b.productId,
      productName: products.find((p) => p.id === b.productId)?.name || b.productName,
      defaultQty: b.quantityPerSet as number | null,
      stock: products.find((p) => p.id === b.productId)?.quantity ?? 0,
    }));
    const otherPart = products
      .filter((p) => !inBundle.has(p.id))
      .map((p) => ({ productId: p.id, productName: p.name, defaultQty: null, stock: p.quantity }));
    return [...bundlePart, ...otherPart];
  }, [bundleItems, products]);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
  );

  const today = new Date().toISOString().slice(0, 10);
  const pendingEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.status !== "ONBOARDED")
        .filter(
          (e) =>
            e.fullName.toLowerCase().includes(empSearch.toLowerCase()) ||
            e.employeeId.toLowerCase().includes(empSearch.toLowerCase())
        )
        .filter((e) => !empFromDate || (e.startDate && e.startDate >= empFromDate))
        .filter((e) => !empToDate || (e.startDate && e.startDate <= empToDate))
        .sort((a, b) => {
          const aToday = a.startDate.startsWith(today) ? 0 : 1;
          const bToday = b.startDate.startsWith(today) ? 0 : 1;
          return aToday - bToday;
        }),
    [employees, empSearch, empFromDate, empToDate, today]
  );

  // Select the first N people currently shown (after search/date filters),
  // so an admin doesn't have to tap through a long list one by one.
  function selectFirstN(n: number) {
    setSelectedEmployees(pendingEmployees.slice(0, n));
  }

  function openModal(p: Product) {
    setModalProduct(p);
    setQuantity(1);
    setEventName("");
    setNote("");
  }

  async function handleGeneralSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modalProduct || quantity <= 0 || !eventName.trim()) {
      toast.error("กรุณาเลือกหมวดหมู่ Event");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "general",
          productId: modalProduct.id,
          quantity,
          eventName: eventName.trim(),
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`เบิก ${modalProduct.name} x${quantity} สำเร็จ`);
        setModalProduct(null);
        loadProducts();
      } else {
        toast.error(
          data.currentQty !== undefined
            ? `ของไม่พอ! คงเหลือในระบบ: ${data.currentQty}`
            : data.error || "เบิกไม่สำเร็จ"
        );
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  function setQty(productId: string, next: number, max: number) {
    setItemQty((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(next, max)) }));
  }

  // Items with quantity > 0, shared by the confirm-summary popup and the
  // actual submit handler so both always agree on what will be sent.
  const confirmItems = useMemo(
    () =>
      onboardingList
        .map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: itemQty[i.productId] ?? 0,
        }))
        .filter((i) => i.quantity > 0),
    [onboardingList, itemQty]
  );

  // Validates the form and, if it's OK, opens the summary popup instead of
  // submitting right away. The button no longer triggers the real action.
  function openConfirmSummary() {
    if (!selectedBundleId || selectedEmployees.length === 0) {
      toast.error("กรุณาเลือกชุดและพนักงานอย่างน้อย 1 คน");
      return;
    }
    if (!confirmItems.length) {
      toast.error("กรุณาเลือกจำนวนอย่างน้อย 1 รายการ");
      return;
    }
    setShowConfirmSummary(true);
  }

  async function handleOnboardingSubmit() {
    if (!selectedBundleId || selectedEmployees.length === 0) {
      toast.error("กรุณาเลือกชุดและพนักงานอย่างน้อย 1 คน");
      return;
    }
    const items = onboardingList
      .map((i) => ({ productId: i.productId, quantity: itemQty[i.productId] ?? 0 }))
      .filter((i) => i.quantity > 0);
    if (!items.length) {
      toast.error("กรุณาเลือกจำนวนอย่างน้อย 1 รายการ");
      return;
    }

    setShowConfirmSummary(false);
    setSubmitting(true);
    const succeeded: Employee[] = [];
    const failed: { emp: Employee; error: string }[] = [];
    // Several people ticked -> no card per person, one summary at the end.
    const batch = selectedEmployees.length > 1;
    const okItemsByEmp: { employeeId: string; items: { productId: string; quantity: number }[] }[] = [];

    // Submitted one employee at a time (not Promise.all) so stock checks
    // for each person see the deductions already made for the people
    // before them in the same batch.
    for (const emp of selectedEmployees) {
      try {
        const res = await fetch("/api/requisitions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "onboarding",
            bundleId: selectedBundleId,
            employeeId: emp.employeeId,
            force: true,
            allowPartial: true,
            notify: !batch,
            items,
          }),
        });
        const data = await res.json();
        if (data.success) {
          succeeded.push(emp);
          const results: { productId: string; success: boolean }[] = Array.isArray(data.results) ? data.results : [];
          okItemsByEmp.push({
            employeeId: emp.employeeId,
            items: results.length
              ? items.filter((i) => results.some((r) => r.productId === i.productId && r.success))
              : items,
          });
        } else {
          failed.push({ emp, error: data.error || "เบิกไม่สำเร็จ" });
        }
      } catch {
        failed.push({ emp, error: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
      }
    }

    setSubmitting(false);
    if (batch && okItemsByEmp.length) sendBatchSummary("onboarding", okItemsByEmp, failed);
    if (succeeded.length) {
      setEmployees((prev) =>
        prev.map((e) =>
          succeeded.some((s) => s.employeeId === e.employeeId) ? { ...e, status: "ONBOARDED" } : e
        )
      );
      loadProducts();
    }
    setResultPopup({
      items: items.map((i) => ({
        productName: onboardingList.find((b) => b.productId === i.productId)?.productName || i.productId,
        quantity: i.quantity,
      })),
      succeeded,
      failed,
    });
    setSelectedEmployees([]);
    setItemQty({});
  }

  // ---------- เบิกสำหรับกิจกรรม ----------
  // Everyone on the roster can be picked (new hires and people who already
  // received the onboarding kit / an earlier activity set). Search by name or
  // employee id. Capped so a huge roster does not render thousands of rows.
  const actEmployees = useMemo(() => {
    const q = actSearch.trim().toLowerCase();
    return employees
      .filter(
        (e) =>
          !q ||
          e.fullName.toLowerCase().includes(q) ||
          e.employeeId.toLowerCase().includes(q) ||
          e.company.toLowerCase().includes(q)
      )
      .filter((e) => !actFromDate || (e.startDate && e.startDate >= actFromDate))
      .filter((e) => !actToDate || (e.startDate && e.startDate <= actToDate))
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
      .slice(0, 200);
  }, [employees, actSearch, actFromDate, actToDate]);

  // The products offered in the activity tab: ONLY the activity bundle's items.
  const actProducts = useMemo(
    () =>
      actBundleItems.map((b) => {
        const p = products.find((x) => x.id === b.productId);
        return {
          productId: b.productId,
          productName: p?.name || b.productName,
          unit: p?.unit || "",
          stock: p?.quantity ?? 0,
          defaultQty: b.defaultQty,
        };
      }),
    [actBundleItems, products]
  );

  // Start every bundle item at its default amount (capped to stock), like the
  // onboarding tab does. Re-runs when the bundle or stock changes.
  function seedActQty() {
    const next: Record<string, number> = {};
    for (const it of actProducts) next[it.productId] = Math.min(it.defaultQty, it.stock);
    setActQty(next);
  }
  useEffect(() => {
    if (mode === "activity") seedActQty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actBundleItems, mode]);

  const actItems = useMemo(
    () =>
      actProducts
        .map((p) => ({
          productId: p.productId,
          productName: p.productName,
          unit: p.unit,
          stock: p.stock,
          quantity: actQty[p.productId] ?? 0,
        }))
        .filter((i) => i.quantity > 0),
    [actProducts, actQty]
  );

  // Quick select: the first N people currently shown (after search / date filters).
  function selectActFirstN(n: number) {
    setActSelected(actEmployees.slice(0, n));
  }

  function toggleActEmployee(emp: Employee) {
    setActSelected((prev) =>
      prev.some((e) => e.id === emp.id) ? prev.filter((e) => e.id !== emp.id) : [...prev, emp]
    );
  }

  function setActItemQty(productId: string, next: number, max: number) {
    setActQty((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(Math.floor(next) || 0, max)) }));
  }

  function openActConfirm() {
    if (actSelected.length === 0) {
      toast.error("กรุณาเลือกพนักงานอย่างน้อย 1 คน");
      return;
    }
    if (!actItems.length) {
      toast.error("กรุณาเลือกจำนวนสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    setShowActConfirm(true);
  }

  // Fire-and-forget: asks the server to post ONE summary card to LINE for a
  // whole multi-person batch (onboarding or activity).
  function sendBatchSummary(
    kind: "onboarding" | "activity",
    people: { employeeId: string; items: { productId: string; quantity: number }[] }[],
    failed: { emp: Employee; error: string }[]
  ) {
    fetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "notify-summary",
        kind,
        people,
        failed: failed.map((f) => ({ name: f.emp.fullName, error: f.error })),
      }),
    }).catch(() => {});
  }

  async function handleActivitySubmit() {
    if (actSelected.length === 0 || !actItems.length) return;
    const items = actItems.map((i) => ({ productId: i.productId, quantity: i.quantity }));
    setShowActConfirm(false);
    setSubmitting(true);
    const succeeded: Employee[] = [];
    const failed: { emp: Employee; error: string }[] = [];

    // One employee at a time so each stock check sees the previous deductions.
    for (const emp of actSelected) {
      try {
        const res = await fetch("/api/requisitions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "activity", employeeId: emp.employeeId, items }),
        });
        const data = await res.json();
        if (data.success) succeeded.push(emp);
        else failed.push({ emp, error: data.error || "เบิกไม่สำเร็จ" });
      } catch {
        failed.push({ emp, error: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
      }
    }

    setSubmitting(false);
    if (succeeded.length) {
      loadProducts();
      // ONE LINE summary for everybody in this batch
      sendBatchSummary(
        "activity",
        succeeded.map((emp) => ({ employeeId: emp.employeeId, items })),
        failed
      );
    }
    setResultPopup({
      items: actItems.map((i) => ({ productName: i.productName, quantity: i.quantity })),
      succeeded,
      failed,
    });
    // keep the people whose withdrawal failed selected so they can retry
    setActSelected(failed.map((f) => f.emp));
    if (!failed.length) seedActQty();
  }

  function toggleEmployee(emp: Employee) {
    setSelectedEmployees((prev) =>
      prev.some((e) => e.id === emp.id) ? prev.filter((e) => e.id !== emp.id) : [...prev, emp]
    );
  }

  return (
    <div className="min-h-screen bg-transparent md:pl-60">
      <PageTransitionOverlay show={submitting} label="กำลังบันทึกรายการเบิก..." />
      <Nav />
      <main className="max-w-5xl mx-0 md:ml-10 px-4 py-6">
        <div className="mb-4 md:mb-5">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">เบิกสินค้า</h1>
          <p className="text-sm text-slate-500 mt-0.5">เลือกสินค้าที่ต้องการ แล้วกดปุ่มเบิกได้เลย</p>
        </div>

        {/* Mode tabs: swipeable single-row chips on mobile, wrap on desktop */}
        <div className="mb-4 md:mb-6 space-y-3">
          <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible no-scrollbar snap-x py-1">
            {(
              [
                { key: "general", label: "เบิกของทั่วไป", on: "bg-emerald-600" },
                { key: "onboarding", label: "เบิกสำหรับพนักงานใหม่", on: "bg-emerald-600" },
                { key: "activity", label: "เบิกสำหรับกิจกรรม", on: "bg-orange-500" },
                { key: "stock", label: "เช็คสต็อกของ Onboarding", on: "bg-emerald-600" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={(e) => {
                  setMode(t.key);
                  e.currentTarget.scrollIntoView({
                    behavior: "smooth",
                    inline: "center",
                    block: "nearest",
                  });
                }}
                className={`shrink-0 snap-start whitespace-nowrap h-11 px-4 md:px-5 rounded-full md:rounded-xl text-sm md:text-[15px] font-semibold transition active:scale-95 ${
                  mode === t.key
                    ? `${t.on} text-white shadow-sm`
                    : "bg-white border border-slate-200 text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === "general" && (
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อสินค้าหรือหมวดหมู่..."
                className="w-full h-11 pl-10 pr-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              />
            </div>
          )}
        </div>

        {loading ? (
          <HopLoader />
        ) : mode === "general" ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
              {filteredProducts.map((p) => {
                const outOfStock = p.quantity <= 0;
                const lowStock = !outOfStock && p.quantity <= p.lowStockThreshold;
                return (
                  <div
                    key={p.id}
                    className="group flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm md:hover:shadow-lg md:hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="relative aspect-[4/3] md:aspect-[5/4] bg-white overflow-hidden border-b border-slate-100">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className={`absolute inset-0 w-full h-full object-contain p-1.5 transition ${
                            outOfStock ? "grayscale opacity-50" : ""
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Package className="w-10 h-10" />
                        </div>
                      )}
                      {lowStock && (
                        <span className="absolute top-2 right-2 bg-amber-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full shadow">
                          เหลือน้อย!
                        </span>
                      )}
                      {outOfStock && (
                        <span className="absolute top-2 right-2 bg-red-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full shadow">
                          หมด
                        </span>
                      )}
                    </div>
                    <div className="p-3 md:p-3.5 flex flex-col flex-1">
                      <span className="inline-block w-fit max-w-full truncate text-[11px] md:text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5 mb-1.5 md:mb-2">
                        {p.category || "ทั่วไป"}
                      </span>
                      <h3 className="font-bold text-sm md:text-base text-slate-900 leading-snug tracking-tight line-clamp-2 min-h-[2.6em] mb-1.5">
                        {p.name}
                      </h3>
                      <p className="text-xs md:text-[13px] text-slate-500 mb-3 flex flex-wrap items-baseline gap-x-1.5 mt-auto">
                        คงเหลือ{" "}
                        <span
                          className={`text-base md:text-lg font-extrabold leading-none ${
                            outOfStock
                              ? "text-red-500"
                              : lowStock
                              ? "text-amber-600"
                              : "text-emerald-700"
                          }`}
                        >
                          {formatNumber(p.quantity)} {p.unit}
                        </span>
                      </p>
                      <button
                        onClick={() => openModal(p)}
                        disabled={outOfStock}
                        className="w-full h-10 md:h-auto md:py-2.5 rounded-xl text-sm md:text-[15px] font-semibold bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 transition disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {outOfStock ? "สินค้าหมด" : "เบิกสินค้า"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && (
                <p className="col-span-full text-center text-slate-400 py-10 text-sm">
                  ไม่พบสินค้าที่ค้นหา
                </p>
              )}
            </div>

            {/* Requisition modal */}
            {modalProduct && (
              <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:px-4"
                onClick={() => !submitting && setModalProduct(null)}
              >
                <form
                  onSubmit={handleGeneralSubmit}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto animate-sheet-up sm:animate-none"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-14 h-14 rounded-lg bg-white border border-slate-100 overflow-hidden shrink-0">
                        {modalProduct.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={modalProduct.imageUrl}
                            alt={modalProduct.name}
                            className="absolute inset-0 w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <Package className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-800">{modalProduct.name}</p>
                        <p className="text-xs text-slate-500">
                          คงเหลือ {formatNumber(modalProduct.quantity)} {modalProduct.unit}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalProduct(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <label className="block text-sm font-medium mb-1.5">จำนวนที่ต้องการเบิก</label>
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-11 h-11 sm:w-9 sm:h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={modalProduct.quantity}
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(
                          Math.max(1, Math.min(Number(e.target.value), modalProduct.quantity))
                        )
                      }
                      className="w-16 text-center border border-slate-200 rounded-lg h-11 sm:h-auto sm:py-2"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(modalProduct.quantity, q + 1))}
                      className="w-11 h-11 sm:w-9 sm:h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-400 ml-1">{modalProduct.unit}</span>
                  </div>

                  <label className="block text-sm font-medium mb-1.5">Event *</label>
                  <select
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    disabled={categoriesLoading}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none mb-4 bg-white disabled:bg-slate-50"
                    required
                  >
                    <option value="">
                      {categoriesLoading
                        ? "กำลังโหลดหมวดหมู่..."
                        : eventCategories.length === 0
                        ? "ไม่พบหมวดหมู่ (ตรวจสอบชีท Config)"
                        : "-- เลือกหมวดหมู่ Event --"}
                    </option>
                    {eventCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <label className="block text-sm font-medium mb-1.5">
                    หมายเหตุ <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    placeholder="เช่น รายละเอียดงาน, สถานที่, ผู้รับของ..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none mb-5"
                  />

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg disabled:opacity-50"
                  >
                    {submitting ? "กำลังเบิก..." : "ยืนยันเบิก"}
                  </button>
                </form>
              </div>
            )}
          </>
        ) : mode === "activity" ? (
          <div className="grid md:grid-cols-2 gap-5">
            {/* Employee picker: whole roster, search by name / id */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm text-slate-700">
                  เลือกพนักงานที่จะรับของ ({actEmployees.length})
                </h2>
                {actSelected.length > 0 && (
                  <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    เลือกแล้ว {actSelected.length} คน
                  </span>
                )}
              </div>
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={actSearch}
                  onChange={(e) => setActSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ หรือ รหัสพนักงาน..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={actFromDate}
                  onChange={(e) => setActFromDate(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none"
                  aria-label="ตั้งแต่วันที่เริ่มงาน"
                />
                <span className="text-slate-400 text-xs">ถึง</span>
                <input
                  type="date"
                  value={actToDate}
                  onChange={(e) => setActToDate(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none"
                  aria-label="ถึงวันที่เริ่มงาน"
                />
                {(actFromDate || actToDate) && (
                  <button
                    onClick={() => {
                      setActFromDate("");
                      setActToDate("");
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ล้าง
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs text-slate-400">เลือกเร็ว:</span>
                <button
                  onClick={() => selectActFirstN(5)}
                  disabled={actEmployees.length === 0}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  5 คนแรก
                </button>
                <button
                  onClick={() => selectActFirstN(10)}
                  disabled={actEmployees.length === 0}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  10 คนแรก
                </button>
                <button
                  onClick={() => selectActFirstN(actEmployees.length)}
                  disabled={actEmployees.length === 0}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  ทั้งหมด
                </button>
                {actSelected.length > 0 && (
                  <button
                    onClick={() => setActSelected([])}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ล้างที่เลือก
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-[520px] overflow-auto pr-1">
                {actEmployees.map((emp) => {
                  const checked = actSelected.some((e) => e.id === emp.id);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggleActEmployee(emp)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition flex items-center gap-3 ${
                        checked ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`shrink-0 rounded border flex items-center justify-center ${
                          checked ? "bg-orange-500 border-orange-500" : "border-slate-300"
                        }`}
                        style={{ width: 18, height: 18 }}
                      >
                        {checked && <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={2.5} />}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                        <UserRound className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {emp.employeeId} · {emp.company || "-"} · {emp.startDate || "-"}
                        </p>
                      </div>
                      {emp.status === "ONBOARDED" && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded shrink-0">
                          ได้รับชุดแล้ว
                        </span>
                      )}
                    </button>
                  );
                })}
                {actEmployees.length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-8">ไม่พบพนักงาน</p>
                )}
              </div>
            </div>

            {/* Item editor */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              {actSelected.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-16">
                  เลือกพนักงานทางซ้าย (เลือกได้หลายคน) เพื่อเริ่มเบิกสำหรับกิจกรรม
                </p>
              ) : (
                <>
                  <div className="mb-4 pb-4 border-b">
                    <p className="font-semibold text-slate-800 mb-1.5">
                      เบิกสำหรับกิจกรรมให้ {actSelected.length} คน
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {actSelected.map((emp) => (
                        <span
                          key={emp.id}
                          className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 pl-2 pr-1 py-1 rounded-full"
                        >
                          {emp.fullName}
                          <button
                            onClick={() => toggleActEmployee(emp)}
                            className="hover:bg-orange-100 rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-medium text-slate-600 mb-1">
                      เลือกสินค้าและจำนวนที่จะเบิก (ไม่ต้องคืนสินค้า)
                    </p>
                    <input
                      type="text"
                      value={actItemSearch}
                      onChange={(e) => setActItemSearch(e.target.value)}
                      placeholder="ค้นหาสินค้า..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                      {actBundleLoading && <p className="text-sm text-slate-400 py-4 text-center">กำลังโหลดรายการ...</p>}
                      {!actBundleLoading && actProducts.length === 0 && (
                        <p className="text-sm text-slate-400 py-4 text-center">
                          {actBundleFound
                            ? "ชุดเบิกสำหรับกิจกรรมยังไม่มีสินค้า"
                            : "ไม่พบชุด Onboarding ที่ชื่อมีคำว่า “กิจกรรม” (สร้างได้ที่ ตั้งค่า > ชุด Onboarding)"}
                        </p>
                      )}
                      {actProducts
                        .filter((p) => p.productName.toLowerCase().includes(actItemSearch.toLowerCase()))
                        .map((item) => {
                          const p = { id: item.productId, name: item.productName, quantity: item.stock, unit: item.unit };
                          const qty = actQty[p.id] ?? 0;
                          const outOfStock = p.quantity <= 0;
                          return (
                            <div
                              key={p.id}
                              className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border ${
                                outOfStock
                                  ? "border-red-200 bg-red-50/50"
                                  : qty > 0
                                  ? "border-orange-200 bg-orange-50/40"
                                  : "border-slate-200"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                                <p className="text-xs text-slate-500">
                                  คงเหลือในสต็อก{" "}
                                  <span className={outOfStock ? "text-red-600 font-semibold" : ""}>
                                    {formatNumber(p.quantity)} {p.unit}
                                  </span>
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setActItemQty(p.id, qty - 1, p.quantity)}
                                  disabled={outOfStock || qty <= 0}
                                  className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={p.quantity}
                                  value={qty}
                                  onChange={(e) => setActItemQty(p.id, Number(e.target.value), p.quantity)}
                                  disabled={outOfStock}
                                  className="w-12 text-center border border-slate-200 rounded-md py-1 text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => setActItemQty(p.id, qty + 1, p.quantity)}
                                  disabled={outOfStock || qty >= p.quantity}
                                  className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <button
                    onClick={openActConfirm}
                    disabled={submitting}
                    className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg disabled:opacity-50"
                  >
                    {submitting ? "กำลังเบิก..." : `ยืนยันเบิกสำหรับกิจกรรม (${actSelected.length} คน)`}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : mode === "stock" ? (
          stockLoading ? (
            <HopLoader />
          ) : stockBundles.length === 0 ? (
            <p className="text-slate-400 text-sm">ยังไม่มีชุดพนักงานใหม่</p>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-slate-500">
                ดูจำนวนสินค้าในชุดพนักงานใหม่ (ดูอย่างเดียว เบิกไม่ได้ในหน้านี้)
              </p>
              {stockBundles.map(({ bundle, items }) => (
                <section key={bundle.id}>
                  <h2 className="text-lg font-semibold text-slate-800 mb-2">{bundle.bundleName}</h2>
                  {items.length === 0 ? (
                    <p className="text-sm text-slate-400">ชุดนี้ยังไม่มีสินค้า</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
                      {items.map((item) => {
                        const p = products.find((x) => x.id === item.productId);
                        const stock = p?.quantity ?? 0;
                        const outOfStock = stock <= 0;
                        const lowStock = !outOfStock && !!p && stock <= p.lowStockThreshold;
                        const name = p?.name || item.productName;
                        return (
                          <div
                            key={item.id}
                            className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
                          >
                            <div className="relative aspect-[5/4] bg-white overflow-hidden border-b border-slate-100">
                              {p?.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.imageUrl}
                                  alt={name}
                                  className={`absolute inset-0 w-full h-full object-contain p-1.5 ${
                                    outOfStock ? "grayscale opacity-50" : ""
                                  }`}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                  <Package className="w-10 h-10" />
                                </div>
                              )}
                              {lowStock && (
                                <span className="absolute top-2 right-2 bg-amber-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full shadow">
                                  เหลือน้อย!
                                </span>
                              )}
                              {outOfStock && (
                                <span className="absolute top-2 right-2 bg-red-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full shadow">
                                  หมด
                                </span>
                              )}
                            </div>
                            <div className="p-3.5">
                              <span className="inline-block max-w-full truncate text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5 mb-2">
                                {p?.category || "ทั่วไป"}
                              </span>
                              <h3 className="font-bold text-base text-slate-900 leading-snug tracking-tight line-clamp-1 mb-1.5">
                                {name}
                              </h3>
                              <p className="text-[13px] text-slate-500 flex items-baseline gap-1.5">
                                คงเหลือ{" "}
                                <span
                                  className={`text-lg font-extrabold leading-none ${
                                    outOfStock
                                      ? "text-red-500"
                                      : lowStock
                                      ? "text-amber-600"
                                      : "text-emerald-700"
                                  }`}
                                >
                                  {formatNumber(stock)} {p?.unit || ""}
                                </span>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {/* Pending employees list */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm text-slate-700">
                  พนักงานที่ยังไม่ได้เบิก ({pendingEmployees.length})
                </h2>
                {selectedEmployees.length > 0 && (
                  <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    เลือกแล้ว {selectedEmployees.length} คน
                  </span>
                )}
              </div>
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ หรือ Employee ID..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={empFromDate}
                  onChange={(e) => setEmpFromDate(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none"
                  aria-label="ตั้งแต่วันที่เริ่มงาน"
                />
                <span className="text-slate-400 text-xs">ถึง</span>
                <input
                  type="date"
                  value={empToDate}
                  onChange={(e) => setEmpToDate(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none"
                  aria-label="ถึงวันที่เริ่มงาน"
                />
                {(empFromDate || empToDate) && (
                  <button
                    onClick={() => {
                      setEmpFromDate("");
                      setEmpToDate("");
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ล้าง
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs text-slate-400">เลือกเร็ว:</span>
                <button
                  onClick={() => selectFirstN(5)}
                  disabled={pendingEmployees.length === 0}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  5 คนแรก
                </button>
                <button
                  onClick={() => selectFirstN(10)}
                  disabled={pendingEmployees.length === 0}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  10 คนแรก
                </button>
                <button
                  onClick={() => selectFirstN(pendingEmployees.length)}
                  disabled={pendingEmployees.length === 0}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  ทั้งหมด
                </button>
                {selectedEmployees.length > 0 && (
                  <button
                    onClick={() => setSelectedEmployees([])}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ล้างที่เลือก
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-[520px] overflow-auto pr-1">
                {pendingEmployees.map((emp) => {
                  const checked = selectedEmployees.some((e) => e.id === emp.id);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggleEmployee(emp)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition flex items-center gap-3 ${
                        checked
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`shrink-0 rounded border flex items-center justify-center ${
                          checked ? "bg-emerald-600 border-emerald-600" : "border-slate-300"
                        }`}
                        style={{ width: 18, height: 18 }}
                      >
                        {checked && <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={2.5} />}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <UserRound className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {emp.company || "-"} · {emp.startDate || "-"}
                        </p>
                      </div>
                      {emp.startDate.startsWith(today) && (
                        <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded shrink-0">
                          <CalendarClock className="w-3 h-3" /> วันนี้
                        </span>
                      )}
                    </button>
                  );
                })}
                {pendingEmployees.length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-8">
                    ไม่มีพนักงานที่รอเบิกของ 
                  </p>
                )}
              </div>
            </div>

            {/* Item editor */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              {selectedEmployees.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-16">
                  เลือกพนักงานทางซ้าย (เลือกได้หลายคน) เพื่อเริ่มเบิกของ
                </p>
              ) : (
                <>
                  <div className="mb-4 pb-4 border-b">
                    <p className="font-semibold text-slate-800 mb-1.5">
                      กำลังเบิกให้ {selectedEmployees.length} คน
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEmployees.map((emp) => (
                        <span
                          key={emp.id}
                          className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 pl-2 pr-1 py-1 rounded-full"
                        >
                          {emp.fullName}
                          <button
                            onClick={() => toggleEmployee(emp)}
                            className="hover:bg-emerald-100 rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {bundles.length > 1 && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-1">เลือกชุด Onboarding</label>
                      <select
                        value={selectedBundleId}
                        onChange={(e) => setSelectedBundleId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="">-- เลือกชุด --</option>
                        {bundles.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bundleName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedBundleId && (
                    <div className="space-y-2 mb-4">
                      <p className="text-sm font-medium text-slate-600 mb-1">
                        เลือกสินค้าและจำนวนที่จะเบิก (ชุดเป็นแค่ค่าเริ่มต้น ปรับหรือเพิ่มสินค้าอื่นได้)
                      </p>
                      <input
                        type="text"
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="ค้นหาสินค้า..."
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      />
                      <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                        {onboardingList
                          .filter((i) => i.productName.toLowerCase().includes(itemSearch.toLowerCase()))
                          .map((item) => {
                            const stock = item.stock;
                            const qty = itemQty[item.productId] ?? 0;
                            const outOfStock = stock <= 0;
                            return (
                              <div
                                key={item.productId}
                                className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border ${
                                  outOfStock
                                    ? "border-red-200 bg-red-50/50"
                                    : qty > 0
                                    ? "border-emerald-200 bg-emerald-50/40"
                                    : "border-slate-200"
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">
                                    {item.productName}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {item.defaultQty !== null
                                      ? `ค่าเริ่มต้นของชุด x${item.defaultQty}`
                                      : "นอกชุด"}{" "}
                                    · คงเหลือในสต็อก{" "}
                                    <span className={outOfStock ? "text-red-600 font-semibold" : ""}>
                                      {formatNumber(stock)}
                                    </span>
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setQty(item.productId, qty - 1, stock)}
                                    disabled={outOfStock || qty <= 0}
                                    className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    max={stock}
                                    value={qty}
                                    onChange={(e) => setQty(item.productId, Number(e.target.value), stock)}
                                    disabled={outOfStock}
                                    className="w-12 text-center border border-slate-200 rounded-md py-1 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setQty(item.productId, qty + 1, stock)}
                                    disabled={outOfStock || qty >= stock}
                                    className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={openConfirmSummary}
                    disabled={submitting || !selectedBundleId}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg disabled:opacity-50"
                  >
                    {submitting
                      ? "กำลังเบิก..."
                      : `ยืนยันเบิกตามจำนวนนี้ (${selectedEmployees.length} คน)`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Pre-submit confirm popup: shows who + what before anything runs */}
        {showConfirmSummary && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:px-4"
            onClick={() => !submitting && setShowConfirmSummary(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto animate-sheet-up sm:animate-none"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-slate-800">ยืนยันการเบิกของ</h3>
                <button
                  onClick={() => setShowConfirmSummary(false)}
                  disabled={submitting}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm font-medium text-slate-600 mb-1.5">
                เบิกให้พนักงาน {selectedEmployees.length} คน
              </p>
              <ul className="text-sm space-y-1 mb-4 max-h-32 overflow-y-auto">
                {selectedEmployees.map((emp) => (
                  <li key={emp.id} className="flex items-center gap-1.5 text-slate-700">
                    <UserRound className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    {emp.fullName} ({emp.employeeId})
                  </li>
                ))}
              </ul>

              <p className="text-sm font-medium text-slate-600 mb-1.5">
                แต่ละคนจะได้รับ (ตามที่เลือก)
              </p>
              <ul className="text-sm bg-slate-50 rounded-lg p-3 mb-5 space-y-1">
                {confirmItems.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{it.productName}</span>
                    <span className="font-medium">x{it.quantity}</span>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowConfirmSummary(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleOnboardingSubmit()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition disabled:opacity-70"
                >
                  {submitting ? "กำลังเบิก..." : "ยืนยัน"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* เบิกสำหรับกิจกรรม: confirm popup */}
        {showActConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:px-4"
            onClick={() => !submitting && setShowActConfirm(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto animate-sheet-up sm:animate-none"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-slate-800">ยืนยันการเบิกสำหรับกิจกรรม</h3>
                <button
                  onClick={() => setShowActConfirm(false)}
                  disabled={submitting}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm font-medium text-slate-600 mb-1.5">
                เบิกให้พนักงาน {actSelected.length} คน
              </p>
              <ul className="text-sm space-y-1 mb-4 max-h-32 overflow-y-auto">
                {actSelected.map((emp) => (
                  <li key={emp.id} className="flex items-center gap-1.5 text-slate-700">
                    <UserRound className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    {emp.fullName} ({emp.employeeId})
                  </li>
                ))}
              </ul>

              <p className="text-sm font-medium text-slate-600 mb-1.5">แต่ละคนจะได้รับ</p>
              <ul className="text-sm bg-slate-50 rounded-lg p-3 mb-2 space-y-1">
                {actItems.map((it) => (
                  <li key={it.productId} className="flex justify-between">
                    <span>{it.productName}</span>
                    <span className="font-medium">x{it.quantity}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400 mb-5">การเบิกสำหรับกิจกรรมไม่ต้องคืนสินค้า</p>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowActConfirm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleActivitySubmit()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-orange-500 hover:bg-orange-400 transition disabled:opacity-70"
                >
                  {submitting ? "กำลังเบิก..." : "ยืนยัน"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Result popup after a bulk onboarding confirm */}
        {resultPopup && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:px-4"
            onClick={() => setResultPopup(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto animate-sheet-up sm:animate-none"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="font-semibold">เบิกของสำเร็จ</h3>
                </div>
                <button
                  onClick={() => setResultPopup(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm font-medium text-slate-600 mb-1.5">รายการที่เบิก</p>
              <ul className="text-sm bg-slate-50 rounded-lg p-3 mb-4 space-y-1">
                {resultPopup.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{it.productName}</span>
                    <span className="font-medium">x{it.quantity}</span>
                  </li>
                ))}
              </ul>

              <p className="text-sm font-medium text-slate-600 mb-1.5">
                มอบให้พนักงาน {resultPopup.succeeded.length} คน
              </p>
              <ul className="text-sm space-y-1 mb-4">
                {resultPopup.succeeded.map((emp) => (
                  <li key={emp.id} className="flex items-center gap-1.5 text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    {emp.fullName} ({emp.employeeId})
                  </li>
                ))}
              </ul>

              {resultPopup.failed.length > 0 && (
                <>
                  <p className="text-sm font-medium text-red-600 mb-1.5">
                    ไม่สำเร็จ {resultPopup.failed.length} คน
                  </p>
                  <ul className="text-sm space-y-1 mb-4">
                    {resultPopup.failed.map(({ emp, error }) => (
                      <li key={emp.id} className="text-red-600">
                        {emp.fullName}: {error}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <button
                onClick={() => setResultPopup(null)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg"
              >
                ปิด
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}