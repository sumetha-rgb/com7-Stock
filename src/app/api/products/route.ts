import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
} from "@/lib/sheets";
import type { SessionUser } from "@/types";

function isValidStockCount(value: unknown): boolean {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return false;
  return Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const products = await getProducts();
    // Filter deleted
    return NextResponse.json(products.filter((p) => !p.name.startsWith("[DELETED]")));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "โหลดสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as SessionUser;
  if (user.role !== "Admin" && user.role !== "Admin2") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      // Image upload + create OR update
      const form = await req.formData();
      const id = form.get("id") as string | null;
      const name = form.get("name") as string;
      const quantity = Number(form.get("quantity") || 0);
      const unit = (form.get("unit") as string) || "ชิ้น";
      const category = (form.get("category") as string) || "";
      const lowStockThreshold = Number(form.get("lowStockThreshold") || 5);
      const file = form.get("image") as File | null;

      if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
        return NextResponse.json({ error: "จำนวนสินค้าและเกณฑ์เตือนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" }, { status: 400 });
      }

      let imageUrl: string | undefined;
      if (file && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        imageUrl = await uploadProductImage(buffer, file.name, file.type);
      }

      if (id) {
        // Update existing product; only overwrite imageUrl if a new file was uploaded
        const result = await updateProduct(id, {
          name,
          ...(imageUrl !== undefined ? { imageUrl } : {}),
          quantity,
          unit,
          category,
          lowStockThreshold,
        });
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json(result.product);
      }

      const product = await createProduct({
        name,
        imageUrl: imageUrl || "",
        quantity,
        unit,
        category,
        lowStockThreshold,
      });
      return NextResponse.json(product);
    }

    // JSON create / update
    const body = await req.json();
    if (body.id) {
      const updates: { name?: string; imageUrl?: string; quantity?: number; unit?: string; category?: string; lowStockThreshold?: number } = {};
      for (const field of ["name", "imageUrl", "unit", "category"] as const) {
        if (body[field] !== undefined) {
          if (typeof body[field] !== "string") return NextResponse.json({ error: "ข้อมูลสินค้าไม่ถูกต้อง" }, { status: 400 });
          updates[field] = body[field];
        }
      }
      if (body.quantity !== undefined) {
        if (!isValidStockCount(body.quantity)) return NextResponse.json({ error: "จำนวนสินค้าต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" }, { status: 400 });
        updates.quantity = Number(body.quantity);
      }
      if (body.lowStockThreshold !== undefined) {
        if (!isValidStockCount(body.lowStockThreshold)) return NextResponse.json({ error: "เกณฑ์เตือนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" }, { status: 400 });
        updates.lowStockThreshold = Number(body.lowStockThreshold);
      }
      const result = await updateProduct(body.id, updates);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result.product);
    }

    const quantity = body.quantity === undefined ? 0 : Number(body.quantity);
    const lowStockThreshold = body.lowStockThreshold === undefined ? 5 : Number(body.lowStockThreshold);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
      return NextResponse.json({ error: "จำนวนสินค้าและเกณฑ์เตือนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" }, { status: 400 });
    }

    const product = await createProduct({
      name: body.name,
      imageUrl: body.imageUrl || "",
      quantity,
      unit: body.unit || "ชิ้น",
      category: body.category || "",
      lowStockThreshold,
    });
    return NextResponse.json(product);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as SessionUser;
  if (user.role !== "Admin" && user.role !== "Admin2") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteProduct(id);
  return NextResponse.json({ success: ok });
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;
