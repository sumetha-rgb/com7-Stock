"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import toast from "react-hot-toast";
import type { Product } from "@/types";
import { formatNumber } from "@/lib/utils";
import { Camera, ImagePlus } from "lucide-react";
import { HopLoader } from "@/components/HopLoader";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: "",
    quantity: 0,
    unit: "ชิ้น",
    category: "",
    lowStockThreshold: 5,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function load() {
    const res = await fetch("/api/products");
    if (res.ok) setProducts(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", quantity: 0, unit: "ชิ้น", category: "", lowStockThreshold: 5 });
    setImageFile(null);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      category: p.category,
      lowStockThreshold: p.lowStockThreshold,
    });
    setImageFile(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (imageFile || !editing) {
        const fd = new FormData();
        if (editing) fd.append("id", editing.id);
        fd.append("name", form.name);
        fd.append("quantity", String(form.quantity));
        fd.append("unit", form.unit);
        fd.append("category", form.category);
        fd.append("lowStockThreshold", String(form.lowStockThreshold));
        if (imageFile) fd.append("image", imageFile);
        const res = await fetch("/api/products", { method: "POST", body: fd });
        if (!res.ok) throw new Error();
        toast.success(editing ? "อัปเดตสำเร็จ" : "เพิ่มสินค้าสำเร็จ");
      } else {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
        if (!res.ok) throw new Error();
        toast.success("อัปเดตสำเร็จ");
      }
      setShowForm(false);
      load();
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("ต้องการลบสินค้านี้?")) return;
    const res = await fetch(`/api/products?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("ลบแล้ว");
      load();
    } else toast.error("ลบไม่สำเร็จ");
  }

  async function adjustStock(p: Product, delta: number) {
    const newQty = Math.max(0, p.quantity + delta);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, quantity: newQty }),
    });
    if (res.ok) {
      toast.success(`ปรับยอดเป็น ${newQty}`);
      load();
    } else toast.error("ปรับยอดไม่สำเร็จ");
  }

  return (
    <div className="min-h-screen bg-slate-50 md:pl-60">
      <PageTransitionOverlay show={submitting} label="กำลังบันทึกสินค้า..." />
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">จัดการสินค้า</h1>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium"
          >
            + เพิ่มสินค้า
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-white border rounded-xl p-5 mb-6 space-y-3 shadow-sm"
          >
            <h2 className="font-semibold">{editing ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}</h2>
            <input
              required
              placeholder="ชื่อสินค้า"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="จำนวน"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="px-3 py-2 border rounded-lg"
              />
              <input
                placeholder="หน่วย"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="หมวดหมู่"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="px-3 py-2 border rounded-lg"
              />
              <input
                type="number"
                placeholder="แจ้งเตือนเมื่อเหลือ ≤ กี่ชิ้น"
                value={form.lowStockThreshold}
                onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                className="px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="flex items-center gap-3">
              <label
                htmlFor="product-image-input"
                className="relative w-20 h-20 shrink-0 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-emerald-400 transition cursor-pointer flex items-center justify-center overflow-hidden group"
              >
                {imagePreview || editing?.imageUrl ? (
                  <img
                    src={imagePreview || editing?.imageUrl}
                    alt="ตัวอย่างรูปสินค้า"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagePlus className="w-6 h-6 text-slate-400 group-hover:text-emerald-500" />
                )}
                <span className="absolute bottom-0 right-0 bg-emerald-600 text-white rounded-full p-1 shadow-md">
                  <Camera className="w-3.5 h-3.5" />
                </span>
                <input
                  id="product-image-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              <div className="text-sm text-slate-500">
                <p>{imageFile ? imageFile.name : "คลิกที่ไอคอนเพื่อเลือกรูปสินค้า"}</p>
                {imageFile && (
                  <button
                    type="button"
                    onClick={() => setImageFile(null)}
                    className="text-red-500 hover:underline mt-0.5"
                  >
                    ลบรูปที่เลือก
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg text-sm"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <HopLoader />
        ) : (
          <div className="grid gap-3">
            {products.map((p) => (
              <div
                key={p.id}
                className="bg-white border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm"
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="w-14 h-14 object-cover rounded" />
                ) : (
                  <div className="w-14 h-14 bg-slate-100 rounded flex items-center justify-center text-slate-400 text-xs">
                    No img
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-slate-500 flex items-center gap-1.5 flex-wrap">
                    <span>{p.category}</span>
                    <span className="text-slate-300">·</span>
                    <span>แจ้งเตือนเมื่อเหลือ ≤ {p.lowStockThreshold} {p.unit}</span>
                    {p.quantity <= p.lowStockThreshold && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">
                        ⚠ ใกล้หมด
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustStock(p, -1)}
                    className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200"
                  >
                    −
                  </button>
                  <span
                    className={`font-bold min-w-[3rem] text-center ${
                      p.quantity <= p.lowStockThreshold ? "text-red-600" : "text-green-700"
                    }`}
                  >
                    {formatNumber(p.quantity)} {p.unit}
                  </span>
                  <button
                    onClick={() => adjustStock(p, 1)}
                    className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200"
                  >
                    +
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(p)}
                    className="text-sm text-emerald-600 hover:underline"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}