/**
 * scripts/setup-sheets.js
 *
 * สร้างแท็บ (sheet tabs) และหัวคอลัมน์ทั้งหมดที่ระบบต้องใช้ ให้อัตโนมัติ
 * โดยอ่าน GOOGLE_SHEETS_ID และ GOOGLE_SERVICE_ACCOUNT_JSON จากไฟล์ .env
 *
 * วิธีรัน:
 *   node scripts/setup-sheets.js
 */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

// ---------- โหลดค่าใน .env แบบง่าย (ไม่ต้องพึ่ง dotenv package) ----------
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.error("ไม่พบไฟล์ .env ที่:", envPath);
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  });
}
loadEnv();

// ---------- Schema ที่ระบบต้องการ (ต้องตรงกับ src/lib/sheets.ts) ----------
const HEADERS = {
  Users: ["id", "name", "email", "username", "password", "role", "status", "employeeId", "createdAt"],
  Products: ["id", "name", "imageUrl", "quantity", "unit", "category", "lowStockThreshold", "updatedAt", "version"],
  RequisitionLog: [
    "id", "userId", "userName", "productId", "productName", "quantityRequested",
    "quantityBefore", "quantityAfter", "eventName", "status", "isOnboarding",
    "bundleId", "employeeId", "employeeName", "createdAt",
  ],
  AuditLog: ["id", "actorId", "actorName", "action", "targetUserId", "detail", "createdAt"],
  OnboardingBundles: ["id", "bundleName", "description", "isActive", "createdAt"],
  OnboardingBundleItems: ["id", "bundleId", "productId", "productName", "quantityPerSet"],
  Employees: ["id", "employeeId", "fullName", "department", "position", "startDate", "status", "linkedUserId", "createdAt"],
};

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!spreadsheetId) {
    console.error("❌ ไม่พบ GOOGLE_SHEETS_ID ใน .env");
    process.exit(1);
  }
  if (!rawJson) {
    console.error("❌ ไม่พบ GOOGLE_SERVICE_ACCOUNT_JSON ใน .env");
    process.exit(1);
  }

  let credentials;
  try {
    credentials = JSON.parse(rawJson);
  } catch (e) {
    console.error("❌ GOOGLE_SERVICE_ACCOUNT_JSON ไม่ใช่ JSON ที่ถูกต้อง (parse ไม่ผ่าน)");
    console.error("   ตรวจสอบว่าคัดลอกไฟล์ key ทั้งไฟล์มาวางเป็นบรรทัดเดียว และมี field ครบ เช่น");
    console.error('   client_email, private_key, project_id ฯลฯ');
    process.exit(1);
  }

  if (!credentials.client_email || !credentials.private_key) {
    console.error("❌ JSON นี้ขาด client_email หรือ private_key");
    console.error("   ดาวน์โหลด key ใหม่จาก Google Cloud Console > IAM & Admin > Service Accounts > Keys");
    process.exit(1);
  }
  if (credentials.private_key.includes("YOUR_PRIVATE_KEY_HERE")) {
    console.error("❌ private_key ยังเป็นค่า placeholder อยู่ (YOUR_PRIVATE_KEY_HERE)");
    console.error("   ต้องนำ private key จริงจากไฟล์ JSON ที่ดาวน์โหลดจาก Google Cloud มาใส่แทน");
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  const sheets = google.sheets({ version: "v4", auth });

  console.log("🔑 Service account:", credentials.client_email);
  console.log("📄 Spreadsheet ID:", spreadsheetId);
  console.log("");
  console.log("⚠️  อย่าลืม: ต้องแชร์สิทธิ์ Editor ของสเปรดชีตนี้ให้อีเมลด้านบนก่อน ไม่งั้นจะขึ้น 403 PERMISSION_DENIED");
  console.log("");

  // 1) ดึงรายชื่อแท็บที่มีอยู่แล้ว
  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId });
  } catch (e) {
    console.error("❌ เปิดสเปรดชีตไม่สำเร็จ:", e.message);
    console.error("   เช็คว่า GOOGLE_SHEETS_ID ถูกต้อง และแชร์สิทธิ์ Editor ให้ service account แล้ว");
    process.exit(1);
  }

  const existingTitles = meta.data.sheets.map((s) => s.properties.title);
  const wanted = Object.keys(HEADERS);
  const missing = wanted.filter((name) => !existingTitles.includes(name));

  // 2) สร้างแท็บที่ยังไม่มี
  if (missing.length > 0) {
    console.log("➕ กำลังสร้างแท็บ:", missing.join(", "));
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missing.map((title) => ({
          addSheet: { properties: { title } },
        })),
      },
    });
  } else {
    console.log("✅ มีแท็บครบทุกอันอยู่แล้ว");
  }

  // 3) ใส่หัวคอลัมน์ (แถวที่ 1) ให้ทุกแท็บ — เขียนทับแถวแรกเสมอเพื่อให้ตรง schema
  for (const [sheetName, headers] of Object.entries(HEADERS)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    console.log(`   ✓ ตั้งหัวคอลัมน์ให้ ${sheetName}`);
  }

  // 4) ลบแท็บ default "Sheet1" ถ้ายังว่างอยู่และไม่ได้อยู่ในรายการที่ต้องการ
  const sheet1 = meta.data.sheets.find(
    (s) => s.properties.title === "Sheet1" && !wanted.includes("Sheet1")
  );
  if (sheet1) {
    console.log("🗑  พบแท็บ 'Sheet1' ที่ไม่ได้ใช้ ลบทิ้งให้อัตโนมัติ...");
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ deleteSheet: { sheetId: sheet1.properties.sheetId } }],
        },
      });
    } catch (e) {
      console.log("   (ข้ามการลบ Sheet1 — อาจเป็นแท็บสุดท้ายที่เหลืออยู่ ลบเองทีหลังได้)");
    }
  }

  console.log("");
  console.log("🎉 ตั้งค่าสเปรดชีตเรียบร้อย! ทุกแท็บพร้อมใช้งานแล้ว");
  console.log("");
  console.log("ขั้นตอนถัดไป: เพิ่มแถวแรกในแท็บ 'Users' ด้วยมือ เพื่อสร้างบัญชี Admin2 คนแรก");
  console.log("(role ต้องเป็น Admin2, status ต้องเป็น ACTIVE)");
}

main().catch((e) => {
  console.error("❌ เกิดข้อผิดพลาด:", e.message || e);
  process.exit(1);
});