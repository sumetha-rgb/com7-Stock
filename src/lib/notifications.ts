/**
 * LINE Messaging API (Flex Message only) + email helpers (Resend or Brevo)
 * Configure via env:
 * - LINE_CHANNEL_ACCESS_TOKEN (for OA Messaging API)
 * - LINE_CHANNEL_SECRET (verify webhook signature for keyword replies)
 * - LINE_HR_GROUP_ID (group that receives the Flex cards)
 * - EMAIL_PROVIDER ("resend" | "brevo") — optional; if unset, Resend is used
 *   when RESEND_API_KEY is present, otherwise falls back to Brevo.
 * - RESEND_API_KEY, RESEND_SENDER_EMAIL (e.g. "Stock Req <noreply@yourdomain.com>")
 * - BREVO_API_KEY, BREVO_SENDER_EMAIL
 */

import { getUsers } from "@/lib/sheets";

// Every ACTIVE user's email in the system — used to broadcast the
// requisition-result emails (success / insufficient stock) to everyone,
// not just a single admin address.
async function getAllActiveUserEmails(): Promise<string[]> {
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
    configured === "resend" || configured === "brevo"
      ? configured
      : process.env.RESEND_API_KEY
      ? "resend"
      : "brevo";

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
          { type: "text", text: "STOCK CHECK", color: "#c9f7e3", size: "xs", weight: "bold", letterSpacing: "2px" },
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
          letterSpacing: "2px",
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
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "baseline",
              contents: [
                {
                  type: "text",
                  text: badgeText,
                  size: "xs",
                  weight: "bold",
                  color: badgeColor,
                  backgroundColor: badgeBg,
                },
              ],
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
}): string {
  const accent = opts.status === "success" ? "#5bba47" : "#dc2626";
  const bgSoft =
    opts.status === "success"
      ? "linear-gradient(135deg,#eafbee 0%,#e3f6ee 100%)"
      : "linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%)";
  const badgeBg = opts.status === "success" ? "#dcfce7" : "#fee2e2";
  const badgeColor = opts.status === "success" ? "#166534" : "#991b1b";
  const badgeText = opts.status === "success" ? "สำเร็จ" : "สต็อกไม่เพียงพอ";

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
                  <svg width="150" height="53" viewBox="0 0 1513 533" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                    <path fill="#7c8082" fill-rule="evenodd" d="m479.3 450.4c-85.8 0-155.1-69.4-155.1-155.1 0-85.8 69.3-155.2 155.1-155.2 85.8 0 155.1 69.4 155.1 155.2 0 85.7-69.3 155.1-155.1 155.1zm94.3-155.1c0-52.2-42.2-94.4-94.3-94.4-52.2 0-94.3 42.2-94.3 94.4 0 52.1 42.1 94.3 94.3 94.3 52.1 0 94.3-42.2 94.3-94.3zm184.5-153.8h60.1v308.9h-60.1zm-38.7 0v308.9h-60.8v-278.5c0-16.6 13.8-30.4 30.4-30.4zm167.9 0c16.6 0 30.4 13.8 30.4 30.4v278.5h-60.8v-308.9zm-582.5 195.5c-17.9 65.7-78 113.4-149.2 113.4-85 0-154.8-69.1-154.8-154.8 0-85.7 69.8-154.8 154.8-154.8 71.9 0 132 49.1 149.9 115.4h-64.2c-15.2-32.5-47.7-55.3-85.7-55.3-51.8 0-94.7 42.9-94.7 94.7 0 51.8 42.9 94.7 94.7 94.7 37.3 0 69.1-22.2 84.3-53.3z"/>
                    <path fill="${accent}" d="m1375.1 98l-34.6-34.6-40.8-40.8c-29.7-29-77.3-29-106.4 0l-70.4 70.5-4.9 4.9zm-260.4 106.4v-103l-2.8 2.8-2.8 2.7-107.1 107.2c-29 29-29 76.7 0 106.4l150 149.9 126.4-266zm381.4 15.2q-2.1-2.8-4.8-5.5l-58.1-58.1-175.5 376.6q1.4-0.7 2.8-0.7 0 0 0.7 0c13.8-2.7 27.6-9.6 38.7-20.7l75.3-75.3 3.4-3.5 112-112.6c27.6-27 29.7-70.5 5.5-100.2z"/>
                  </svg>
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
  // LINE: Flex card only (no plain-text message) to the HR/ops group.
  const groupId = process.env.LINE_HR_GROUP_ID;
  if (groupId) {
    const card = buildRequisitionResultCard({
      status: "success",
      title: "เบิกของสำเร็จ",
      rows: [
        { label: "ผู้เบิก", value: data.userName },
        { label: "สินค้า", value: data.productName },
        { label: "จำนวนที่เบิก", value: `${data.quantity}`, emphasize: true },
        { label: "คงเหลือในสต็อก", value: `${data.remaining}`, emphasize: true },
        { label: "Event", value: data.eventName },
        ...(data.note ? [{ label: "หมายเหตุ", value: data.note }] : []),
      ],
    });
    await sendLineOAMessage(groupId, [
      { type: "flex", altText: `เบิกของสำเร็จ - ${data.productName}`, contents: card },
    ]);
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
  // LINE: Flex card only (no plain-text message) to the HR/ops group.
  const groupId = process.env.LINE_HR_GROUP_ID;
  if (groupId) {
    const card = buildRequisitionResultCard({
      status: "insufficient",
      title: "สต็อกไม่เพียงพอ",
      rows: [
        { label: "ผู้ขอเบิก", value: data.userName },
        { label: "สินค้า", value: data.productName },
        { label: "จำนวนที่ขอ", value: `${data.requested}`, emphasize: true },
        { label: "คงเหลือจริง", value: `${data.available}`, emphasize: true },
      ],
    });
    await sendLineOAMessage(groupId, [
      { type: "flex", altText: `สต็อกไม่พอ - ${data.productName}`, contents: card },
    ]);
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
          letterSpacing: "2px",
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
  const groupId = process.env.LINE_HR_GROUP_ID;
  if (groupId) {
    const card = buildOnboardingHrCard(data);
    await sendLineOAMessage(groupId, [
      { type: "flex", altText: `Onboarding Kit สำเร็จ - ${data.employeeName}`, contents: card },
    ]);
  }
}

// One LINE summary card for a whole batch (several employees ticked at once)
// of either "เบิกสำหรับพนักงานใหม่" (onboarding) or "เบิกสำหรับกิจกรรม" (activity),
// instead of one card per person.
export async function notifyBatchSummary(data: {
  kind: "onboarding" | "activity";
  requestedBy: string;
  people: { name: string; employeeId: string }[];
  // total = sum over every person; perPerson = set when everyone got the same qty
  items: { name: string; total: number; perPerson: number | null }[];
  failed: { name: string; error: string }[];
}) {
  const groupId = process.env.LINE_HR_GROUP_ID;
  if (data.people.length === 0) return;

  const isAct = data.kind === "activity";
  const accent = isAct ? "#c2410c" : "#0f6e56";
  const accentSoft = isAct ? "#ffedd5" : "#c9f7e3";
  const title = isAct ? "เบิกสำหรับกิจกรรมสำเร็จ" : "จัดชุดพนักงานใหม่สำเร็จ";
  const eyebrow = isAct ? "ACTIVITY REQUISITION" : "ONBOARDING KIT";

  const MAX_PEOPLE = 25;
  const MAX_ITEMS = 25;
  const shownPeople = data.people.slice(0, MAX_PEOPLE);
  const morePeople = data.people.length - shownPeople.length;
  const shownItems = data.items.slice(0, MAX_ITEMS);

  const personRows = shownPeople.map((p, i) => ({
    type: "text",
    text: `${i + 1}. ${p.name} (${p.employeeId})`,
    size: "sm",
    color: "#334155",
    wrap: true,
  }));
  if (morePeople > 0) {
    personRows.push({ type: "text", text: `…และอีก ${morePeople} คน`, size: "sm", color: "#94a3b8", wrap: true });
  }

  const itemRows = shownItems.map((it) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 4,
        contents: [
          { type: "text", text: it.name, size: "sm", color: "#334155", wrap: true },
          ...(it.perPerson !== null && data.people.length > 1
            ? [{ type: "text", text: `คนละ ${it.perPerson}`, size: "xxs", color: "#94a3b8" }]
            : []),
        ],
      },
      {
        type: "text",
        text: `x${it.total}`,
        size: "sm",
        color: accent,
        weight: "bold",
        align: "end",
        flex: 1,
      },
    ],
  }));

  const failedBlock =
    data.failed.length > 0
      ? [
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "xs",
            contents: [
              { type: "text", text: `ไม่สำเร็จ ${data.failed.length} คน`, size: "xs", color: "#b91c1c", weight: "bold" },
              ...data.failed.slice(0, 10).map((f) => ({
                type: "text",
                text: `${f.name}: ${f.error}`,
                size: "xs",
                color: "#b91c1c",
                wrap: true,
              })),
            ],
          },
        ]
      : [];

  const card = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: accent,
      paddingAll: "16px",
      contents: [
        { type: "text", text: eyebrow, color: accentSoft, size: "xs", weight: "bold", letterSpacing: "2px" },
        { type: "text", text: title, color: "#ffffff", size: "lg", weight: "bold", margin: "sm" },
        { type: "text", text: `ทั้งหมด ${data.people.length} คน`, color: accentSoft, size: "sm", margin: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "18px",
      contents: [
        { type: "text", text: "รายชื่อพนักงาน", size: "xs", color: "#94a3b8", weight: "bold" },
        { type: "box", layout: "vertical", spacing: "xs", contents: personRows },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "xs",
          contents: [
            { type: "text", text: "รายการที่เบิก (รวมทุกคน)", size: "xs", color: "#94a3b8", weight: "bold" },
            ...itemRows,
          ],
        },
        ...failedBlock,
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      backgroundColor: "#f8fafc",
      contents: [
        { type: "text", text: `ดำเนินการโดย ${data.requestedBy}`, size: "xxs", color: "#94a3b8", align: "center" },
      ],
    },
  };

  // LINE and e-mail are independent: a failure in one must not stop the other.
  if (groupId) {
    try {
      await sendLineOAMessage(groupId, [
        {
          type: "flex",
          altText: `${title} - ${data.people.length} คน`,
          contents: card,
        },
      ]);
    } catch (e) {
      console.error("Batch summary LINE failed:", e);
    }
  }

  // E-mail: ONE summary mail to every ACTIVE user (same audience as the
  // other requisition e-mails) instead of one mail per employee.
  const esc = (s: string) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const recipients = await getAllActiveUserEmails();
  if (recipients.length > 0) {
    const peopleHtml =
      shownPeople.map((p, i) => `${i + 1}. ${esc(p.name)} (${esc(p.employeeId)})`).join("<br/>") +
      (morePeople > 0 ? `<br/>…และอีก ${morePeople} คน` : "");
    const itemsHtml = shownItems
      .map(
        (it) =>
          `${esc(it.name)} x${it.total}` +
          (it.perPerson !== null && data.people.length > 1 ? ` (คนละ ${it.perPerson})` : "")
      )
      .join("<br/>");
    const rows = [
      { label: "ผู้ดำเนินการ", value: esc(data.requestedBy) },
      { label: "จำนวนพนักงาน", value: `${data.people.length} คน` },
      { label: "รายชื่อพนักงาน", value: peopleHtml },
      { label: "รายการที่เบิก (รวมทุกคน)", value: itemsHtml || "-" },
      ...(data.failed.length > 0
        ? [
            {
              label: "ไม่สำเร็จ",
              value: data.failed
                .slice(0, 10)
                .map((f) => `${esc(f.name)}: ${esc(f.error)}`)
                .join("<br/>"),
            },
          ]
        : []),
    ];
    try {
      await sendEmail({
        to: recipients,
        subject: `✅ ${title} - ${data.people.length} คน`,
        htmlContent: buildAlertEmailHtml({
          status: "success",
          eyebrow: isAct ? "แจ้งเตือนการเบิกสำหรับกิจกรรม" : "แจ้งเตือนการจัดชุดพนักงานใหม่",
          heading: `${title} ✅`,
          intro: `${esc(data.requestedBy)} เบิกของให้พนักงาน ${data.people.length} คน ระบบสรุปรายการทั้งหมดไว้ในอีเมลฉบับเดียว`,
          rows,
          footerNote: "อีเมลนี้ส่งอัตโนมัติถึงพนักงานทุกคนในระบบ เป็นสรุปรวมเมื่อเลือกเบิกให้หลายคนพร้อมกัน",
        }),
      });
    } catch (e) {
      console.error("Batch summary email failed:", e);
    }
  }
}

export async function notifyNewUser(data: {
  name: string;
  username: string;
  password: string;
  email: string;
  role: string;
}) {
  // Login link: left as a placeholder until the app is deployed (e.g. to
  // Vercel). Once you have a real domain, set NEXT_PUBLIC_APP_URL in the
  // environment (e.g. https://stock-req.vercel.app/login) and this will
  // automatically start pointing the button there — no code change needed.
  const loginUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/login`
    : "#";

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
                  <svg width="150" height="53" viewBox="0 0 1513 533" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                    <path fill="#7c8082" fill-rule="evenodd" d="m479.3 450.4c-85.8 0-155.1-69.4-155.1-155.1 0-85.8 69.3-155.2 155.1-155.2 85.8 0 155.1 69.4 155.1 155.2 0 85.7-69.3 155.1-155.1 155.1zm94.3-155.1c0-52.2-42.2-94.4-94.3-94.4-52.2 0-94.3 42.2-94.3 94.4 0 52.1 42.1 94.3 94.3 94.3 52.1 0 94.3-42.2 94.3-94.3zm184.5-153.8h60.1v308.9h-60.1zm-38.7 0v308.9h-60.8v-278.5c0-16.6 13.8-30.4 30.4-30.4zm167.9 0c16.6 0 30.4 13.8 30.4 30.4v278.5h-60.8v-308.9zm-582.5 195.5c-17.9 65.7-78 113.4-149.2 113.4-85 0-154.8-69.1-154.8-154.8 0-85.7 69.8-154.8 154.8-154.8 71.9 0 132 49.1 149.9 115.4h-64.2c-15.2-32.5-47.7-55.3-85.7-55.3-51.8 0-94.7 42.9-94.7 94.7 0 51.8 42.9 94.7 94.7 94.7 37.3 0 69.1-22.2 84.3-53.3z"/>
                    <path fill="#5bba47" d="m1375.1 98l-34.6-34.6-40.8-40.8c-29.7-29-77.3-29-106.4 0l-70.4 70.5-4.9 4.9zm-260.4 106.4v-103l-2.8 2.8-2.8 2.7-107.1 107.2c-29 29-29 76.7 0 106.4l150 149.9 126.4-266zm381.4 15.2q-2.1-2.8-4.8-5.5l-58.1-58.1-175.5 376.6q1.4-0.7 2.8-0.7 0 0 0.7 0c13.8-2.7 27.6-9.6 38.7-20.7l75.3-75.3 3.4-3.5 112-112.6c27.6-27 29.7-70.5 5.5-100.2z"/>
                  </svg>
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