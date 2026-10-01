import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getProducts } from "@/lib/sheets";
import { STOCK_KEYWORD, buildStockSummaryMessage, replyLineMessage } from "@/lib/notifications";

export const runtime = "nodejs";

// Webhook URL to set in LINE Developers Console:
//   https://<your-domain>/api/line/webhook   (turn on "Use webhook")
// Required env: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN
// This path is not in middleware.ts's matcher, so LINE can call it without a login.

function isValidSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type LineEvent = {
  type: string;
  replyToken?: string;
  message?: { type: string; text?: string };
};

export async function POST(req: NextRequest) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    console.error("LINE_CHANNEL_SECRET not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const raw = await req.text();
  if (!isValidSignature(raw, req.headers.get("x-line-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = JSON.parse(raw).events ?? [];
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const wantsStock = events.filter(
    (e) =>
      e.type === "message" &&
      e.message?.type === "text" &&
      !!e.replyToken &&
      (e.message.text ?? "").replace(/\s+/g, "").includes(STOCK_KEYWORD)
  );

  if (wantsStock.length > 0) {
    try {
      const products = (await getProducts()).filter((p) => !p.name.startsWith("[DELETED]"));
      const message = buildStockSummaryMessage(products);
      await Promise.all(wantsStock.map((e) => replyLineMessage(e.replyToken as string, [message])));
    } catch (err) {
      console.error("LINE stock keyword error:", err);
    }
  }

  // LINE expects a quick 200 for every valid request (including the "Verify" button).
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "line-webhook" });
}