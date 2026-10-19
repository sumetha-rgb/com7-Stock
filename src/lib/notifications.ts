/**
 * LINE Messaging API (Flex Message only) + email helpers (Gmail, Resend or Brevo)
 * Configure via env:
 * - LINE_CHANNEL_ACCESS_TOKEN (for OA Messaging API)
 * - LINE_CHANNEL_SECRET (verify webhook signature for keyword replies)
 * - LINE_HR_GROUP_ID (group that receives the Flex cards)
 * - EMAIL_PROVIDER ("gmail" | "resend" | "brevo") — optional; if unset, Resend is used
 *   when RESEND_API_KEY is present, otherwise falls back to Brevo.
 * - GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM_EMAIL, GMAIL_FROM_NAME
 * - RESEND_API_KEY, RESEND_SENDER_EMAIL (e.g. "Stock Req <noreply@yourdomain.com>")
 * - BREVO_API_KEY, BREVO_SENDER_EMAIL
 */

import { getUsers } from "@/lib/sheets";
import type { BatchKind, BatchNotification } from "@/types";

// Public address of the app. Used for the logo image and the "เข้าสู่ระบบ" button
// in e-mails. Set NEXT_PUBLIC_APP_URL in Vercel to override (e.g. a custom domain).
const DEFAULT_APP_URL = "https://com7-stock-requisition-system.vercel.app";
function appBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    DEFAULT_APP_URL;
  return fromEnv.trim().replace(/\/$/, "");
}

// Gmail / Outlook / mobile mail apps strip inline vector markup, so the logo
// must be a real PNG served from a public URL. It is rendered on the fly by
// src/app/api/email-logo/route.tsx (no file in /public needed, and it is not
// covered by the auth middleware, so mail clients can fetch it).
function logoHtml(): string {
  return `<img src="${appBaseUrl()}/api/email-logo" width="150" alt="COM7" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:150px;" />`;
}

// Every ACTIVE user's email in the system — used to broadcast the
// requisition-result emails (success / insufficient stock) to everyone,
// not just a single admin address.
export async function getAllActiveUserEmails(): Promise<string[]> {
  try {
    const users = await getUsers();
    const emails = users
      .filter((u) => u.status === "ACTIVE" && u.email?.trim())
      .map((u) => u.email.trim());
    return Array.from(new Set(emails));
  } catch (e) {
    console.error("getAllActiveUserEmails error:", e);
    return [];
  }
}

// Vercel env values often pick up a trailing newline / space / quotes when
// pasted, which makes LINE reject the push. Normalise it here.
export function getHrGroupId(): string | null {
  const id = (process.env.LINE_HR_GROUP_ID || "").trim().replace(/^["']|["']$/g, "");
  if (!id) return null;
  if (!/^[CR][0-9a-f]{32}$/i.test(id)) {
    console.warn(
      `LINE_HR_GROUP_ID looks wrong (${id.slice(0, 4)}…, len ${id.length}). A group ID starts with "C" and is 33 chars; ` +
        `IDs starting with "U" are user IDs, not groups.`
    );
  }
  return id;
}

// Push a Flex card to the HR group. If LINE rejects the Flex JSON (HTTP 400),
// fall back to a plain text message so the group is still notified.
export async function pushFlexToHrGroup(altText: string, contents: Record<string, unknown>, fallbackText: string): Promise<boolean> {
  const groupId = getHrGroupId();
  if (!groupId) {
    console.warn("LINE_HR_GROUP_ID not set - skipping LINE notification");
    return false;
  }
  const ok = await sendLineOAMessage(groupId, [{ type: "flex", altText: altText.slice(0, 400), contents }]);
  if (ok) return true;
  console.warn("LINE flex push failed - retrying as plain text");
  return sendLineOAMessage(groupId, [{ type: "text", text: fallbackText.slice(0, 4900) }]);
}

export async function sendLineNotify(message: string): Promise<boolean> {
  const token = process.env.LINE_NOTIFY_TOKEN;
  if (!token) {
    console.warn("LINE_NOTIFY_TOKEN not set");
    return false;
  }
  try {
    const res = await fetch("https://notify-api.line.me/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
      body: new URLSearchParams({ message }),
    });
    return res.ok;
  } catch (e) {
    console.error("LINE Notify error:", e);
    return false;
  }
}

type LineMessage = { type: "text"; text: string } | { type: "flex"; altText: string; contents: Record<string, unknown> };

export async function sendLineOAMessage(
  to: string, // userId or groupId
  messages: LineMessage[]
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("LINE_CHANNEL_ACCESS_TOKEN not set");
    return false;
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages }),
    });
    if (!res.ok) {
      // LINE explains the failure in the body (invalid token, bot not in the
      // group, wrong ID, monthly quota reached, bad Flex JSON ...). Log it
      // instead of failing silently.
      const detail = await res.text().catch(() => "");
      console.error(`LINE push failed: HTTP ${res.status} to=${to.slice(0, 6)}… ${detail}`);
    }
    return res.ok;
  } catch (e) {
    console.error("LINE OA error:", e);
    return false;
  }
}

export async function sendBrevoEmail(params: {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL || "noreply@example.com";
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set");
    return false;
  }
  const toList = Array.isArray(params.to)
    ? params.to.map((email) => ({ email }))
    : [{ email: params.to }];

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: sender, name: "Stock Requisition System" },
        to: toList,
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: params.textContent,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("Brevo email error:", e);
    return false;
  }
}

// Gmail API using a dedicated sender account and an OAuth refresh token.
// Only the gmail.send scope is needed; no mailbox-reading permission is requested.
export async function sendGmailEmail(params: {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}): Promise<boolean> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const sender = process.env.GMAIL_FROM_EMAIL || process.env.GMAIL_SENDER_EMAIL;
  const senderName = (process.env.GMAIL_FROM_NAME || "Stock").replace(/[\r\n\"<>]/g, "").trim() || "Stock";
  if (!clientId || !clientSecret || !refreshToken || !sender) {
    console.warn("Gmail email not configured: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_FROM_EMAIL");
    return false;
  }

  try {
    const { google } = await import("googleapis");
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const recipients = (Array.isArray(params.to) ? params.to : [params.to])
      .map((email) => email.trim())
      .filter(Boolean);
    if (recipients.length === 0) return false;

    const encodeBase64 = (value: string) => Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const encodeMimePart = (value: string) => Buffer.from(value, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");
    const boundary = `stock-req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const subject = `=?UTF-8?B?${Buffer.from(`${senderName} | ${params.subject}`, "utf8").toString("base64")}?=`;
    const textContent = params.textContent || params.htmlContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const mime = [
      `From: ${senderName} <${sender}>`,
      `To: ${recipients.join(", ")}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeMimePart(textContent),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeMimePart(params.htmlContent),
      `--${boundary}--`,
      "",
    ].join("\r\n");

    await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodeBase64(mime) } });
    return true;
  } catch (e) {
    console.error("Gmail API email error:", e);
    return false;
  }
}

// Resend (https://resend.com) — simple REST API, no SDK dependency needed.
// RESEND_SENDER_EMAIL can be a bare address ("noreply@yourdomain.com") or a
// display-name form ("Stock Req <noreply@yourdomain.com>"); Resend accepts
// both directly in the "from" field, same as Brevo's sender convention here.
export async function sendResendEmail(params: {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.RESEND_SENDER_EMAIL || "Stock Requisition System <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.htmlContent,
        text: params.textContent,
      }),
    });
    if (!res.ok) {
      // Resend returns a JSON error body (e.g. unverified domain, bad
      // "from" address) that's worth surfacing in logs since a silent
      // false here otherwise looks identical to a network failure.
      const body = await res.text().catch(() => "");
      console.error("Resend email error:", res.status, body);
    }
    return res.ok;
  } catch (e) {
    console.error("Resend email error:", e);
    return false;
  }
}

// Unified entry point — every call site in this file should send email
// through here rather than calling sendBrevoEmail/sendResendEmail directly,
// so the provider can be swapped (or run side-by-side during migration)
// with an env var change and no further code changes.
export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}): Promise<boolean> {
  const configured = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  const provider =
    configured === "gmail" || configured === "resend" || configured === "brevo"
      ? configured
      : process.env.RESEND_API_KEY
      ? "resend"
      : "brevo";

  if (provider === "gmail") return sendGmailEmail(params);
  return provider === "resend" ? sendResendEmail(params) : sendBrevoEmail(params);
}

// ---------------------------------------------------------------------------
// Keyword reply: "เช็คสต็อกของ" -> Flex summary of every product and how many
// are left. Long lists are split into a carousel (max 12 bubbles, 12 rows each).
// ---------------------------------------------------------------------------
export const STOCK_KEYWORD = "เช็คสต็อกของ";

export async function replyLineMessage(replyToken: string, messages: LineMessage[]): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("LINE_CHANNEL_ACCESS_TOKEN not set");
    return false;
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages }),
    });
    return res.ok;
  } catch (e) {
    console.error("LINE reply error:", e);
    return false;
  }
}

export function buildStockSummaryMessage(
  products: { name: string; quantity: number; unit: string; lowStockThreshold: number }[],
  now: Date = new Date()
): LineMessage {
  const ROWS_PER_BUBBLE = 12;
  const MAX_BUBBLES = 12;
  const accent = "#0f6e56";
  const total = products.length;
  const low = products.filter((p) => p.quantity > 0 && p.quantity <= p.lowStockThreshold).length;
  const out = products.filter((p) => p.quantity <= 0).length;
  const updated = now.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const chunks: typeof products[] = [];
  for (let i = 0; i < products.length; i += ROWS_PER_BUBBLE) {
    chunks.push(products.slice(i, i + ROWS_PER_BUBBLE));
  }
  if (chunks.length === 0) chunks.push([]);
  const shown = chunks.slice(0, MAX_BUBBLES);

  const bubbles = shown.map((chunk, idx) => {
    const rows = chunk.map((p) => {
      const isOut = p.quantity <= 0;
      const isLow = !isOut && p.quantity <= p.lowStockThreshold;
      return {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          { type: "text", text: p.name, size: "sm", color: "#334155", flex: 5, wrap: true },
          {
            type: "text",
            text: isOut ? "หมด" : `${p.quantity.toLocaleString("th-TH")} ${p.unit}`,
            size: "sm",
            weight: "bold",
            color: isOut || isLow ? "#b91c1c" : accent,
            flex: 3,
            align: "end",
            wrap: true,
          },
        ],
      };
    });
    const withSeparators: Record<string, unknown>[] = [];
    rows.forEach((r, i) => {
      if (i > 0) withSeparators.push({ type: "separator", color: "#eef2f6" });
      withSeparators.push(r);
    });
    return {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: accent,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "STOCK CHECK", color: "#c9f7e3", size: "xs", weight: "bold" },
          { type: "text", text: "📦 สรุปสต็อกสินค้า", color: "#ffffff", size: "lg", weight: "bold", margin: "sm" },
          {
            type: "text",
            text: `ทั้งหมด ${total} รายการ · ใกล้หมด ${low} · หมด ${out}`,
            color: "#e6fff5",
            size: "xs",
            margin: "sm",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "18px",
        contents: withSeparators.length
          ? withSeparators
          : [{ type: "text", text: "ยังไม่มีสินค้าในระบบ", size: "sm", color: "#94a3b8", align: "center" }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        backgroundColor: "#f8fafc",
        contents: [
          {
            type: "text",
            text: `อัปเดต ${updated}${shown.length > 1 ? ` · หน้า ${idx + 1}/${shown.length}` : ""}`,
            size: "xxs",
            color: "#94a3b8",
            align: "center",
          },
        ],
      },
    };
  });

  return {
    type: "flex",
    altText: `สรุปสต็อกสินค้า ทั้งหมด ${total} รายการ`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
}

// ---------------------------------------------------------------------------
// Requisition result cards (LINE Flex) — condition 1: success (green),
// condition 2: insufficient stock (red). Sent to LINE_HR_GROUP_ID, mirroring
// the richer onboarding card, in addition to the plain-text broadcast.
// ---------------------------------------------------------------------------

function buildRequisitionResultCard(opts: {
  status: "success" | "insufficient";
  title: string;
  rows: { label: string; value: string; emphasize?: boolean }[];
}): Record<string, unknown> {
  const accent = opts.status === "success" ? "#0f6e56" : "#b91c1c";
  const accentSoft = opts.status === "success" ? "#c9f7e3" : "#fecaca";
  const badgeBg = opts.status === "success" ? "#dcfce7" : "#fee2e2";
  const badgeColor = opts.status === "success" ? "#166534" : "#991b1b";
  const badgeText = opts.status === "success" ? "สำเร็จ" : "ไม่สำเร็จ";
  const icon = opts.status === "success" ? "✅" : "⚠️";

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: accent,
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: opts.status === "success" ? "REQUISITION" : "STOCK ALERT",
          color: accentSoft,
          size: "xs",
          weight: "bold",
        },
        {
          type: "text",
          text: `${icon} ${opts.title}`,
          color: "#ffffff",
          size: "lg",
          weight: "bold",
          margin: "sm",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "18px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "box",
              layout: "vertical",
              flex: 0,
              backgroundColor: badgeBg,
              cornerRadius: "xxl",
              paddingTop: "4px",
              paddingBottom: "4px",
              paddingStart: "12px",
              paddingEnd: "12px",
              contents: [{ type: "text", text: badgeText, size: "xs", weight: "bold", color: badgeColor }],
            },
          ],
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: opts.rows.map((r) => ({
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: r.label, size: "xs", color: "#94a3b8", flex: 2 },
              {
                type: "text",
                text: r.value,
                size: "xs",
                color: r.emphasize ? accent : "#334155",
                weight: r.emphasize ? "bold" : "regular",
                flex: 3,
                align: "end",
                wrap: true,
              },
            ],
          })),
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      backgroundColor: "#f8fafc",
      contents: [
        {
          type: "text",
          text: "ระบบเบิกสินค้าคงคลัง",
          size: "xxs",
          color: "#94a3b8",
          align: "center",
        },
      ],
    },
  };
}

// Shared email shell — same logo header used for the new-user email, with an
// accent color/badge that switches per event (green = success, red = alert).
function buildAlertEmailHtml(opts: {
  status: "success" | "insufficient";
  eyebrow: string;
  heading: string;
  intro: string;
  rows: { label: string; value: string }[];
  footerNote: string;
  badgeText?: string; // override the pill text (default: สำเร็จ / สต็อกไม่เพียงพอ)
  extraHtml?: string; // extra blocks rendered under the rows box
}): string {
  const accent = opts.status === "success" ? "#5bba47" : "#dc2626";
  const bgSoft =
    opts.status === "success"
      ? "linear-gradient(135deg,#eafbee 0%,#e3f6ee 100%)"
      : "linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%)";
  const badgeBg = opts.status === "success" ? "#dcfce7" : "#fee2e2";
  const badgeColor = opts.status === "success" ? "#166534" : "#991b1b";
  const badgeText = opts.badgeText ?? (opts.status === "success" ? "สำเร็จ" : "สต็อกไม่เพียงพอ");

  const rowsHtml = opts.rows
    .map(
      (r) => `
                          <tr>
                            <td style="padding:6px 0; font-size:13px; color:#94a3b8; width:140px;">${r.label}</td>
                            <td style="padding:6px 0; font-size:14px; color:#1f2937; font-weight:600;">${r.value}</td>
                          </tr>`
    )
    .join("");

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f1; font-family:'Segoe UI', Arial, Helvetica, sans-serif; padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:#ffffff; border-radius:16px; overflow:hidden;">
              <tr>
                <td style="background:${bgSoft}; border-bottom:1px solid #e2e8f0; padding:28px 32px;">
                  ${logoHtml()}
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 4px; font-size:13px; color:${accent}; font-weight:600; letter-spacing:.04em; text-transform:uppercase;">${opts.eyebrow}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                    <tr>
                      <td>
                        <h1 style="margin:0; font-size:22px; color:#1f2937; display:inline;">${opts.heading}</h1>
                      </td>
                    </tr>
                  </table>
                  <span style="display:inline-block; background:${badgeBg}; color:${badgeColor}; font-size:12px; font-weight:700; padding:4px 12px; border-radius:999px; margin-bottom:16px;">${badgeText}</span>
                  <p style="margin:16px 0 24px; font-size:14px; line-height:1.7; color:#475569;">
                    ${opts.intro}
                  </p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                    <tr>
                      <td style="padding:18px 20px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}
                        </table>
                      </td>
                    </tr>
                  </table>
                  ${opts.extraHtml || ""}
                  <p style="margin:20px 0 0; font-size:12px; line-height:1.6; color:#94a3b8;">
                    ${opts.footerNote}
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:16px 32px; text-align:center;">
                  <p style="margin:0; font-size:11px; color:#94a3b8;">อีเมลนี้ส่งโดยระบบเบิกสินค้าคงคลังอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
}

// Convenience wrappers
//
// เงื่อนไขที่ 1: เบิกสำเร็จ — การ์ด/อีเมลโทนเขียว
export async function notifyRequisitionSuccess(data: {
  userName: string;
  productName: string;
  quantity: number;
  eventName: string;
  note?: string; // หมายเหตุ (optional)
  remaining: number; // stock quantity left after this deduction
}) {
  // LINE: Flex card to the HR/ops group (plain-text fallback if Flex is rejected).
  {
    const rows = [
      { label: "ผู้เบิก", value: data.userName },
      { label: "สินค้า", value: data.productName },
      { label: "จำนวนที่เบิก", value: `${data.quantity}`, emphasize: true },
      { label: "คงเหลือในสต็อก", value: `${data.remaining}`, emphasize: true },
      { label: "Event", value: data.eventName },
      ...(data.note ? [{ label: "หมายเหตุ", value: data.note }] : []),
    ];
    const card = buildRequisitionResultCard({ status: "success", title: "เบิกของสำเร็จ", rows });
    await pushFlexToHrGroup(
      `เบิกของสำเร็จ - ${data.productName}`,
      card,
      `✅ เบิกของสำเร็จ\n` + rows.map((r) => `${r.label}: ${r.value}`).join("\n")
    ).catch((e) => console.error("LINE success notify error:", e));
  }

  // Email everyone (all ACTIVE users in the system), not just one admin.
  const recipients = await getAllActiveUserEmails();
  if (recipients.length > 0) {
    await sendEmail({
      to: recipients,
      subject: `✅ เบิกของสำเร็จ - ${data.productName}`,
      htmlContent: buildAlertEmailHtml({
        status: "success",
        eyebrow: "แจ้งเตือนการเบิกของ",
        heading: "เบิกของสำเร็จ ✅",
        intro: `${data.userName} เบิกสินค้าจากคลังสำเร็จ ระบบได้ตัดสต็อกให้เรียบร้อยแล้ว`,
        rows: [
          { label: "ผู้เบิก", value: data.userName },
          { label: "สินค้า", value: data.productName },
          { label: "จำนวนที่เบิก", value: `${data.quantity}` },
          { label: "คงเหลือในสต็อก", value: `${data.remaining}` },
          { label: "Event", value: data.eventName },
          ...(data.note ? [{ label: "หมายเหตุ", value: data.note }] : []),
        ],
        footerNote: "อีเมลนี้ส่งอัตโนมัติถึงพนักงานทุกคนในระบบ ทุกครั้งที่มีการเบิกของสำเร็จในโหมด \"เบิกของทั่วไป\"",
      }),
    });
  }
}

// เงื่อนไขที่ 2: เบิกของไม่สำเร็จเนื่องจากสต็อกไม่พอ — การ์ด/อีเมลโทนแดง
export async function notifyInsufficientStock(data: {
  userName: string;
  productName: string;
  requested: number;
  available: number;
}) {
  {
    const rows = [
      { label: "ผู้ขอเบิก", value: data.userName },
      { label: "สินค้า", value: data.productName },
      { label: "จำนวนที่ขอ", value: `${data.requested}`, emphasize: true },
      { label: "คงเหลือจริง", value: `${data.available}`, emphasize: true },
    ];
    const card = buildRequisitionResultCard({ status: "insufficient", title: "สต็อกไม่เพียงพอ", rows });
    await pushFlexToHrGroup(
      `สต็อกไม่พอ - ${data.productName}`,
      card,
      `⚠️ สต็อกไม่เพียงพอ\n` + rows.map((r) => `${r.label}: ${r.value}`).join("\n")
    ).catch((e) => console.error("LINE insufficient notify error:", e));
  }

  // Email everyone (all ACTIVE users in the system), not just one admin.
  const recipients = await getAllActiveUserEmails();
  if (recipients.length > 0) {
    await sendEmail({
      to: recipients,
      subject: `⚠️ สต็อกไม่เพียงพอ - ${data.productName}`,
      htmlContent: buildAlertEmailHtml({
        status: "insufficient",
        eyebrow: "แจ้งเตือนสต็อกสินค้า",
        heading: "เบิกของไม่สำเร็จ ⚠️",
        intro: `${data.userName} พยายามเบิก "${data.productName}" ในโหมดเบิกของทั่วไป แต่สินค้าคงเหลือในคลังไม่เพียงพอ กรุณาตรวจสอบและเติมสต็อก`,
        rows: [
          { label: "ผู้ขอเบิก", value: data.userName },
          { label: "สินค้า", value: data.productName },
          { label: "จำนวนที่ขอเบิก", value: `${data.requested}` },
          { label: "คงเหลือจริงในสต็อก", value: `${data.available}` },
        ],
        footerNote: "อีเมลนี้ส่งอัตโนมัติถึงพนักงานทุกคนในระบบ ทุกครั้งที่มีการเบิกของไม่สำเร็จเนื่องจากสต็อกไม่พอ",
      }),
    });
  }
}

// Card sent only to the LINE_HR_GROUP_ID — richer layout than the plain-text
// broadcast, since HR reads this to confirm what a new hire actually received.
function buildOnboardingHrCard(data: {
  employeeName: string;
  employeeId: string;
  department: string;
  position: string;
  startDate: string;
  requestedBy: string;
  items: { name: string; qty: number }[];
}): Record<string, unknown> {
  const itemRows = data.items.map((it) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: it.name,
        size: "sm",
        color: "#334155",
        flex: 4,
        wrap: true,
      },
      {
        type: "text",
        text: `x${it.qty}`,
        size: "sm",
        color: "#0f6e56",
        weight: "bold",
        align: "end",
        flex: 1,
      },
    ],
  }));

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#0f6e56",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: "ONBOARDING KIT",
          color: "#c9f7e3",
          size: "xs",
          weight: "bold",
        },
        {
          type: "text",
          text: "จัดชุดพนักงานใหม่สำเร็จ",
          color: "#ffffff",
          size: "lg",
          weight: "bold",
          margin: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "18px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: data.employeeName,
              size: "xl",
              weight: "bold",
              color: "#0f172a",
            },
            {
              type: "text",
              text: `${data.position} · ${data.department}`,
              size: "sm",
              color: "#64748b",
              margin: "xs",
            },
          ],
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "รหัสพนักงาน", size: "xs", color: "#94a3b8", flex: 2 },
                { type: "text", text: data.employeeId, size: "xs", color: "#334155", flex: 3, align: "end" },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "วันที่เริ่มงาน", size: "xs", color: "#94a3b8", flex: 2 },
                { type: "text", text: data.startDate, size: "xs", color: "#334155", flex: 3, align: "end" },
              ],
            },
          ],
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: "รายการที่จัดให้",
              size: "xs",
              color: "#94a3b8",
              weight: "bold",
              margin: "none",
            },
            ...itemRows,
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      backgroundColor: "#f8fafc",
      contents: [
        {
          type: "text",
          text: `ดำเนินการโดย ${data.requestedBy}`,
          size: "xxs",
          color: "#94a3b8",
          align: "center",
        },
      ],
    },
  };
}

export async function notifyOnboardingSuccess(data: {
  employeeName: string;
  employeeId: string;
  department: string;
  position: string;
  startDate: string;
  requestedBy: string;
  items: { name: string; qty: number }[];
}) {
  // HR group: Flex Message card only.
  const card = buildOnboardingHrCard(data);
  await pushFlexToHrGroup(
    `Onboarding Kit สำเร็จ - ${data.employeeName}`,
    card,
    `จัดชุดพนักงานใหม่สำเร็จ\n${data.employeeName} (${data.employeeId})\n` +
      data.items.map((i) => `${i.name} x${i.qty}`).join("\n")
  ).catch((e) => console.error("LINE onboarding notify error:", e));
}

// ---------------------------------------------------------------------------
// Batch digest — multi-person requisitions are queued (NotificationQueue sheet)
// and announced as ONE summary: automatically at 09:00 (Asia/Bangkok) or when
// an admin presses the button. Each queued row = one batch, so "10 people got
// shirt + kit" and "5 people got a shirt" stay separate sections.
// ---------------------------------------------------------------------------
const DIGEST_META: Record<BatchKind, { title: string; eyebrow: string; emailEyebrow: string; accent: string; soft: string }> = {
  onboarding: {
    title: "สรุปการจัดชุดพนักงานใหม่",
    eyebrow: "ONBOARDING KIT",
    emailEyebrow: "สรุปการจัดชุดพนักงานใหม่",
    accent: "#0f6e56",
    soft: "#c9f7e3",
  },
  activity: {
    title: "สรุปการเบิกสำหรับกิจกรรม",
    eyebrow: "ACTIVITY REQUISITION",
    emailEyebrow: "สรุปการเบิกสำหรับกิจกรรม",
    accent: "#c2410c",
    soft: "#ffedd5",
  },
};

const escHtml = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function bkkText(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", ...opts }) : "";
}
const dateTimeText = (iso: string) => bkkText(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export interface DigestContent {
  subject: string;
  html: string;
  altText: string;
  flex: Record<string, unknown>;
  groupCount: number;
  peopleCount: number;
}

// ---- grouping ----------------------------------------------------------
// People who received exactly the same set of items (same products, same
// quantity each) form ONE group, no matter how many separate submissions they
// came from. A different set of items opens a new group. Groups are ordered by
// first appearance, so the first submission is always "กลุ่มที่ 1".
type DigestItem = { name: string; qty: number };
interface DigestGroup {
  items: DigestItem[]; // per person
  people: string[]; // one entry per time somebody received this set
}

function personItems(b: BatchNotification, idx: number): DigestItem[] {
  const own = b.people[idx]?.items;
  if (own && own.length) return own;
  // Older queue rows (before per-person detail was stored): approximate from totals.
  const n = Math.max(1, b.people.length);
  return b.items.map((it) => ({ name: it.name, qty: it.perPerson ?? Math.max(1, Math.round(it.total / n)) }));
}

export function groupBatches(batches: BatchNotification[]): DigestGroup[] {
  const map = new Map<string, DigestGroup>();
  const ordered = [...batches].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  for (const b of ordered) {
    b.people.forEach((p, idx) => {
      const items = personItems(b, idx);
      const key = [...items]
        .sort((x, y) => x.name.localeCompare(y.name, "th"))
        .map((i) => `${i.name}\u0000${i.qty}`)
        .join("|");
      let g = map.get(key);
      if (!g) {
        g = { items, people: [] };
        map.set(key, g);
      }
      g.people.push(p.name);
    });
  }
  return [...map.values()];
}

export const countDigestGroups = (batches: BatchNotification[]) => groupBatches(batches).length;

// "สมชาย, สมหญิง ×2" — a person who received the same set twice is shown once with a count.
function namesWithCounts(people: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of people) counts.set(n, (counts.get(n) || 0) + 1);
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${n} (${c} ครั้ง)` : n));
}

// Single source of truth: the preview dialog and the real send both call this,
// so what the admin approves is exactly what goes out.
export function buildBatchDigest(kind: BatchKind, batches: BatchNotification[]): DigestContent {
  const meta = DIGEST_META[kind];
  const groups = groupBatches(batches);
  const peopleCount = groups.reduce((n, g) => n + g.people.length, 0);
  const subject = `📦 ${meta.title} - ${groups.length} กลุ่ม ${peopleCount} คน`;
  const failedAll = batches.flatMap((b) => b.failed);
  const requesters = [...new Set(batches.map((b) => b.requestedBy).filter(Boolean))];
  const times = batches.map((b) => b.createdAt).filter(Boolean).sort();
  const first = times[0] || "";
  const last = times[times.length - 1] || "";

  // ---------- e-mail ----------
  const MAX_GROUPS = 20;
  const MAX_NAMES = 60;
  const shown = groups.slice(0, MAX_GROUPS);

  const groupHtml = shown
    .map((g, i) => {
      const n = g.people.length;
      const items = g.items
        .map((it) => (n > 1 ? `${escHtml(it.name)}: คนละ ${it.qty} (รวม ${it.qty * n})` : `${escHtml(it.name)} x${it.qty}`))
        .join("<br/>");
      const names = namesWithCounts(g.people);
      const nameHtml =
        names.slice(0, MAX_NAMES).map((nm, j) => `${j + 1}. ${escHtml(nm)}`).join("<br/>") +
        (names.length > MAX_NAMES ? `<br/>…และอีก ${names.length - MAX_NAMES} คน` : "");
      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 12px; font-size:15px; font-weight:700; color:#1f2937;">กลุ่มที่ ${i + 1} · ${n} คน</p>
              <p style="margin:0 0 2px; font-size:12px; color:#94a3b8;">ของที่ได้รับ</p>
              <p style="margin:0 0 12px; font-size:14px; line-height:1.7; color:#1f2937; font-weight:600;">${items || "-"}</p>
              <p style="margin:0 0 2px; font-size:12px; color:#94a3b8;">รายชื่อพนักงาน</p>
              <p style="margin:0; font-size:13px; line-height:1.7; color:#334155;">${nameHtml}</p>
            </td>
          </tr>
        </table>`;
    })
    .join("");
  const moreGroups =
    groups.length > shown.length
      ? `<p style="margin:12px 0 0; font-size:13px; color:#94a3b8;">…และอีก ${groups.length - shown.length} กลุ่ม</p>`
      : "";
  const failedHtml =
    failedAll.length > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0; background:#fef2f2; border:1px solid #fecaca; border-radius:12px;">
          <tr><td style="padding:14px 20px;">
            <p style="margin:0 0 4px; font-size:13px; font-weight:700; color:#b91c1c;">ไม่สำเร็จ ${failedAll.length} คน</p>
            <p style="margin:0; font-size:13px; line-height:1.7; color:#b91c1c;">${failedAll
              .slice(0, 15)
              .map((f) => `${escHtml(f.name)}: ${escHtml(f.error)}`)
              .join("<br/>")}</p>
          </td></tr>
        </table>`
      : "";

  // Grand total per product across every group
  const grand = new Map<string, number>();
  for (const g of groups) for (const it of g.items) grand.set(it.name, (grand.get(it.name) || 0) + it.qty * g.people.length);
  const grandHtml =
    [...grand.entries()].slice(0, 25).map(([name, total]) => `${escHtml(name)} x${total}`).join("<br/>") || "-";

  const html = buildAlertEmailHtml({
    status: "success",
    eyebrow: meta.emailEyebrow,
    heading: `${meta.title} 📦`,
    badgeText: "สรุปรายการ",
    intro:
      peopleCount === 1
        ? "มีการเบิกให้พนักงาน 1 คน ตามรายละเอียดด้านล่าง"
        : `มีการเบิกให้พนักงานรวม ${peopleCount} คน แบ่งเป็น ${groups.length} กลุ่มตามของที่ได้รับ`,
    rows: [
      { label: "จำนวนกลุ่ม", value: `${groups.length} กลุ่ม` },
      { label: "พนักงานรวม", value: `${peopleCount} คน` },
      { label: "ผู้ดำเนินการ", value: requesters.map(escHtml).join(", ") || "-" },
      { label: "ช่วงเวลา", value: first === last ? dateTimeText(first) : `${dateTimeText(first)} – ${dateTimeText(last)}` },
      { label: "รวมทุกกลุ่ม", value: grandHtml },
    ],
    extraHtml: groupHtml + moreGroups + failedHtml,
    footerNote: "อีเมลนี้ส่งอัตโนมัติถึงพนักงานทุกคนในระบบ เป็นสรุปรวมของการเบิกที่ยังไม่ได้แจ้งในรอบนี้",
  });

  // ---------- LINE Flex ----------
  const LINE_GROUPS = 8;
  const LINE_NAMES = 40;
  const lineShown = groups.slice(0, LINE_GROUPS);
  const blocks: Record<string, unknown>[] = [];
  lineShown.forEach((g, i) => {
    if (i > 0) blocks.push({ type: "separator", margin: "lg" });
    const n = g.people.length;
    const names = namesWithCounts(g.people);
    // One name per line, numbered — same layout as the e-mail (1. ..., 2. ...)
    const nameLines: Record<string, unknown>[] = names.slice(0, LINE_NAMES).map((nm, j) => ({
      type: "text",
      text: `${j + 1}. ${nm}`,
      size: "xs",
      color: "#334155",
      wrap: true,
    }));
    if (names.length > LINE_NAMES) {
      nameLines.push({ type: "text", text: `…และอีก ${names.length - LINE_NAMES} คน`, size: "xs", color: "#94a3b8", wrap: true });
    }
    blocks.push({
      type: "box",
      layout: "vertical",
      margin: i > 0 ? "lg" : "none",
      spacing: "xs",
      contents: [
        { type: "text", text: `กลุ่มที่ ${i + 1} · ${n} คน`, size: "sm", weight: "bold", color: "#1f2937" },
        ...g.items.slice(0, 15).map((it) => ({
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            {
              type: "text",
              text: it.name + (n > 1 ? ` (คนละ ${it.qty})` : ""),
              size: "sm",
              color: "#334155",
              wrap: true,
              flex: 4,
            },
            { type: "text", text: `x${it.qty * n}`, size: "sm", weight: "bold", color: meta.accent, align: "end", flex: 1 },
          ],
        })),
        { type: "text", text: "รายชื่อพนักงาน", size: "xs", color: "#94a3b8", margin: "md" },
        { type: "box", layout: "vertical", margin: "xs", spacing: "xs", contents: nameLines },
      ],
    });
  });
  if (groups.length > lineShown.length) {
    blocks.push({
      type: "text",
      text: `…และอีก ${groups.length - lineShown.length} กลุ่ม (ดูครบในอีเมล)`,
      size: "xs",
      color: "#94a3b8",
      margin: "lg",
    });
  }
  if (failedAll.length > 0) {
    blocks.push({ type: "separator", margin: "lg" });
    blocks.push({ type: "text", text: `ไม่สำเร็จ ${failedAll.length} คน`, size: "xs", color: "#b91c1c", weight: "bold", margin: "md" });
    failedAll.slice(0, 8).forEach((f) =>
      blocks.push({ type: "text", text: `${f.name}: ${f.error}`, size: "xs", color: "#b91c1c", wrap: true })
    );
  }

  const flex = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: meta.accent,
      paddingAll: "16px",
      contents: [
        { type: "text", text: meta.eyebrow, color: meta.soft, size: "xs", weight: "bold" },
        { type: "text", text: meta.title, color: "#ffffff", size: "lg", weight: "bold", margin: "sm" },
        { type: "text", text: `${groups.length} กลุ่ม · ${peopleCount} คน`, color: meta.soft, size: "sm", margin: "xs" },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "18px", contents: blocks },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      backgroundColor: "#f8fafc",
      contents: [{ type: "text", text: "ระบบเบิกสินค้าคงคลัง", size: "xxs", color: "#94a3b8", align: "center" }],
    },
  };

  return {
    subject,
    html,
    altText: `${meta.title} - ${groups.length} กลุ่ม ${peopleCount} คน`,
    flex,
    groupCount: groups.length,
    peopleCount,
  };
}

// Who a digest would reach (shown in the preview dialog).
export async function getDigestAudience(): Promise<{ emailCount: number; lineConfigured: boolean }> {
  const emails = await getAllActiveUserEmails();
  return { emailCount: emails.length, lineConfigured: !!getHrGroupId() };
}

// Sends the digest to LINE (HR group) and e-mail (all ACTIVE users). The two
// channels are independent. null = channel not configured / nobody to send to.
export async function sendBatchDigest(
  kind: BatchKind,
  batches: BatchNotification[]
): Promise<{ email: boolean | null; line: boolean | null }> {
  const content = buildBatchDigest(kind, batches);
  const groupId = getHrGroupId();
  const recipients = await getAllActiveUserEmails();

  const [line, email] = await Promise.all([
    groupId
      ? sendLineOAMessage(groupId, [{ type: "flex", altText: content.altText, contents: content.flex }]).catch(() => false)
      : Promise.resolve(null),
    recipients.length > 0
      ? sendEmail({ to: recipients, subject: content.subject, htmlContent: content.html }).catch(() => false)
      : Promise.resolve(null),
  ]);
  return { email, line };
}

export async function notifyNewUser(data: {
  name: string;
  username: string;
  password: string;
  email: string;
  role: string;
}) {
  // "เข้าสู่ระบบ" button -> the login page of the deployed app.
  const loginUrl = `${appBaseUrl()}/login`;

  await sendEmail({
    to: data.email,
    subject: "บัญชีผู้ใช้ระบบเบิกสินค้าคงคลัง",
    htmlContent: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f1; font-family:'Segoe UI', Arial, Helvetica, sans-serif; padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:#ffffff; border-radius:16px; overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#eafbee 0%,#e3f6ee 100%); border-bottom:1px solid #e2e8f0; padding:28px 32px;">
                  ${logoHtml()}
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 4px; font-size:13px; color:#5bba47; font-weight:600; letter-spacing:.04em; text-transform:uppercase;">ยินดีต้อนรับ</p>
                  <h1 style="margin:0 0 16px; font-size:22px; color:#1f2937;">สวัสดี, ${data.name} 👋</h1>
                  <p style="margin:0 0 24px; font-size:14px; line-height:1.7; color:#475569;">
                    บัญชีของคุณในระบบเบิกสินค้าคงคลังถูกสร้างเรียบร้อยแล้ว ใช้ข้อมูลด้านล่างนี้เพื่อเข้าสู่ระบบครั้งแรก
                  </p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                    <tr>
                      <td style="padding:18px 20px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding:6px 0; font-size:13px; color:#94a3b8; width:110px;">Username</td>
                            <td style="padding:6px 0; font-size:14px; color:#1f2937; font-weight:600; font-family:monospace;">${data.username}</td>
                          </tr>
                          <tr>
                            <td style="padding:6px 0; font-size:13px; color:#94a3b8;">Password</td>
                            <td style="padding:6px 0; font-size:14px; color:#1f2937; font-weight:600; font-family:monospace;">${data.password}</td>
                          </tr>
                          <tr>
                            <td style="padding:6px 0; font-size:13px; color:#94a3b8;">สิทธิ์การใช้งาน</td>
                            <td style="padding:6px 0;">
                              <span style="display:inline-block; background:#dcfce7; color:#166534; font-size:12px; font-weight:600; padding:3px 10px; border-radius:999px;">${data.role}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
                    <tr>
                      <td style="border-radius:10px; background:#5bba47;">
                        <a href="${loginUrl}" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px;">เข้าสู่ระบบ →</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0; font-size:12px; line-height:1.6; color:#94a3b8;">
                    หากพบปัญหาระหว่างเข้าสู่ระบบหรือใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:16px 32px; text-align:center;">
                  <p style="margin:0; font-size:11px; color:#94a3b8;">อีเมลนี้ส่งโดยระบบเบิกสินค้าคงคลังอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
  });
  // Note: the LINE notify to admins on every new signup has been removed
  // per request. sendLineNotify/sendLineOAMessage above are still used
  // elsewhere (requisitions, onboarding, low stock) — only this one call
  // was taken out.
}
