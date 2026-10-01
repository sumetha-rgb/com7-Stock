import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getOnboardingBundles,
  getBundlesWithItems,
  getBundleItems,
  createBundle,
  createBundleItem,
  updateBundleItem,
  deleteBundleItem,
} from "@/lib/sheets";
import type { SessionUser } from "@/types";

// Bundle contents change whenever admin edits a bundle - never cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const bundleId = searchParams.get("bundleId");
  const include = searchParams.get("include");

  try {
    if (include === "items") {
      return NextResponse.json(await getBundlesWithItems());
    }
    if (bundleId) {
      const items = await getBundleItems(bundleId);
      return NextResponse.json({ items });
    }
    const bundles = await getOnboardingBundles();
    return NextResponse.json(bundles);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "โหลดไม่สำเร็จ" }, { status: 500 });
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
    const body = await req.json();
    if (body.type === "bundle") {
      const bundle = await createBundle({
        bundleName: body.bundleName,
        description: body.description || "",
        isActive: body.isActive !== false,
      });
      return NextResponse.json(bundle);
    }
    if (body.type === "item") {
      const item = await createBundleItem({
        bundleId: body.bundleId,
        productId: body.productId,
        productName: body.productName,
        quantityPerSet: Number(body.quantityPerSet) || 1,
      });
      return NextResponse.json(item);
    }
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as SessionUser;
  if (user.role !== "Admin" && user.role !== "Admin2") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, productId, productName, quantityPerSet } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const updates: Partial<{ productId: string; productName: string; quantityPerSet: number }> = {};
    if (productId) updates.productId = productId;
    if (productName) updates.productName = productName;
    if (quantityPerSet !== undefined) updates.quantityPerSet = Number(quantityPerSet);

    const item = await updateBundleItem(id, updates);
    if (!item) {
      return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "แก้ไขไม่สำเร็จ" }, { status: 500 });
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

  try {
    const ok = await deleteBundleItem(id);
    if (!ok) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}

// Vercel: allow enough time for a slow Google Sheets call (default can be 10s).
export const maxDuration = 30;