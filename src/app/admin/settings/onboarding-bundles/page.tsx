"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Package, Loader2, Check, X } from "lucide-react";
import type { OnboardingBundle, OnboardingBundleItem, Product } from "@/types";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";

export default function OnboardingBundlesPage() {
  const [bundles, setBundles] = useState<OnboardingBundle[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<string>("");
  const [items, setItems] = useState<OnboardingBundleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [newBundleName, setNewBundleName] = useState("");
  const [newBundleDesc, setNewBundleDesc] = useState("");
  const [creatingBundle, setCreatingBundle] = useState(false);

  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [addingItem, setAddingItem] = useState(false);

  // inline edit state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [savingEdit, setSavingEdit] = useState(false);

  // delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<OnboardingBundleItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadBundles() {
    const res = await fetch("/api/bundles");
    if (res.ok) setBundles(await res.json());
  }

  async function loadItems(bundleId: string) {
    setLoadingItems(true);
    try {
      const r = await fetch(`/api/bundles?bundleId=${bundleId}`);
      const d = await r.json();
      setItems(d.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    loadBundles();
    fetch("/api/products")
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedBundle) loadItems(selectedBundle);
    else setItems([]);
  }, [selectedBundle]);

  async function createBundle() {
    if (!newBundleName.trim()) {
      toast.error("กรุณาใส่ชื่อชุด");
      return;
    }
    setCreatingBundle(true);
    try {
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bundle",
          bundleName: newBundleName.trim(),
          description: newBundleDesc,
          isActive: true,
        }),
      });
      if (res.ok) {
        toast.success("สร้างชุดสำเร็จ");
        setNewBundleName("");
        setNewBundleDesc("");
        loadBundles();
      } else toast.error("สร้างไม่สำเร็จ");
    } finally {
      setCreatingBundle(false);
    }
  }

  async function addItem() {
    if (!selectedBundle || !addProductId) {
      toast.error("กรุณาเลือกสินค้า");
      return;
    }
    const p = products.find((x) => x.id === addProductId);
    if (!p) return;
    setAddingItem(true);
    try {
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "item",
          bundleId: selectedBundle,
          productId: addProductId,
          productName: p.name,
          quantityPerSet: addQty,
        }),
      });
      if (res.ok) {
        toast.success("เพิ่มรายการสำเร็จ");
        setAddProductId("");
        setAddQty(1);
        loadItems(selectedBundle);
      } else toast.error("เพิ่มไม่สำเร็จ");
    } finally {
      setAddingItem(false);
    }
  }

  function startEdit(item: OnboardingBundleItem) {
    setEditingItemId(item.id);
    setEditQty(item.quantityPerSet);
  }

  function cancelEdit() {
    setEditingItemId(null);
  }

  async function saveEdit(item: OnboardingBundleItem) {
    setSavingEdit(true);
    try {
      const res = await fetch("/api/bundles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, quantityPerSet: editQty }),
      });
      if (res.ok) {
        toast.success("บันทึกการแก้ไขแล้ว");
        setEditingItemId(null);
        loadItems(selectedBundle);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "แก้ไขไม่สำเร็จ");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bundles?id=${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("ลบรายการแล้ว");
        setDeleteTarget(null);
        loadItems(selectedBundle);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "ลบไม่สำเร็จ");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 md:pl-60">
      <PageTransitionOverlay
        show={creatingBundle || addingItem || savingEdit}
        label="กำลังบันทึกชุด Onboarding..."
      />
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            จัดการชุด Onboarding
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            สร้างชุดอุปกรณ์มาตรฐานสำหรับพนักงานใหม่ และกำหนดรายการสินค้าในแต่ละชุด
          </p>
        </div>

        {/* Create bundle */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm shadow-slate-200/50">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-600" />
            สร้างชุดใหม่
          </h2>
          <div className="space-y-3">
            <input
              placeholder="ชื่อชุด เช่น Office / Warehouse"
              value={newBundleName}
              onChange={(e) => setNewBundleName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition text-sm"
            />
            <input
              placeholder="คำอธิบาย (ไม่บังคับ)"
              value={newBundleDesc}
              onChange={(e) => setNewBundleDesc(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition text-sm"
            />
            <button
              onClick={createBundle}
              disabled={creatingBundle}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-60 flex items-center gap-2"
            >
              {creatingBundle ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {creatingBundle ? "กำลังสร้าง..." : "สร้างชุด"}
            </button>
          </div>
        </section>

        {/* Manage items */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-200/50">
          <h2 className="font-semibold text-slate-800 mb-4">จัดการรายการในชุด</h2>
          <select
            value={selectedBundle}
            onChange={(e) => setSelectedBundle(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition text-sm mb-4"
          >
            <option value="">-- เลือกชุด --</option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bundleName} {b.isActive ? "" : "(ปิด)"}
              </option>
            ))}
          </select>

          {selectedBundle && (
            <>
              <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
                {loadingItems ? (
                  <div className="px-4 py-6 flex items-center justify-center text-slate-400 text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังโหลด...
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-4 py-6 text-center text-slate-400 text-sm">
                    ยังไม่มีรายการในชุดนี้
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="px-4 py-3 flex items-center justify-between text-sm hover:bg-slate-50 transition"
                      >
                        <span className="text-slate-700 font-medium">{item.productName}</span>

                        {editingItemId === item.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              value={editQty}
                              onChange={(e) => setEditQty(Number(e.target.value))}
                              className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              autoFocus
                            />
                            <button
                              onClick={() => saveEdit(item)}
                              disabled={savingEdit}
                              title="บันทึก"
                              className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-60"
                            >
                              {savingEdit ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={savingEdit}
                              title="ยกเลิก"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500">x{item.quantityPerSet}</span>
                            <button
                              onClick={() => startEdit(item)}
                              title="แก้ไขจำนวน"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(item)}
                              title="ลบรายการ"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">สินค้า</label>
                  <select
                    value={addProductId}
                    onChange={(e) => setAddProductId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  >
                    <option value="">-- เลือก --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">จำนวน/ชุด</label>
                  <input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={(e) => setAddQty(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <button
                  onClick={addItem}
                  disabled={addingItem}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-60 flex items-center gap-1.5 h-[42px] shrink-0"
                >
                  {addingItem ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  เพิ่ม
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`ลบ "${deleteTarget?.productName}" ออกจากชุดนี้?`}
        description="รายการนี้จะถูกลบออกจากชุดพนักงานใหม่และไม่สามารถย้อนกลับได้"
        confirmLabel="ลบรายการ"
        loading={deleting}
        loadingLabel="กำลังลบ..."
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}