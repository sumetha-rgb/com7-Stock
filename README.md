# Stock Req — ระบบเบิกสินค้าคงคลัง

เว็บแอปสำหรับเบิก คืน และติดตามสต็อกสินค้าภายในองค์กร ใช้ **Google Sheets เป็นฐานข้อมูล** แจ้งเตือนผ่าน **LINE** และอีเมล รองรับทั้งคอมพิวเตอร์และมือถือ

---

## สารบัญ

- [ความสามารถหลัก](#ความสามารถหลัก)
- [สิทธิ์การใช้งาน (Role)](#สิทธิ์การใช้งาน-role)
- [เทคโนโลยีที่ใช้](#เทคโนโลยีที่ใช้)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [เริ่มต้นใช้งาน](#เริ่มต้นใช้งาน)
- [ตัวแปรสภาพแวดล้อม (.env)](#ตัวแปรสภาพแวดล้อม-env)
- [ตั้งค่า Google Sheets](#ตั้งค่า-google-sheets)
- [ตั้งค่า LINE](#ตั้งค่า-line)
- [หลักการทำงานของระบบ](#หลักการทำงานของระบบ)
- [API](#api)
- [การแสดงผลบนมือถือ](#การแสดงผลบนมือถือ)
- [การ Deploy](#การ-deploy)
- [ข้อควรระวังด้านความปลอดภัย](#ข้อควรระวังด้านความปลอดภัย)

---

## ความสามารถหลัก

### เบิกสินค้า (`/staff/requisition`)

มี 4 โหมดในหน้าเดียว

| โหมด | ใช้ทำอะไร |
|---|---|
| **เบิกของทั่วไป** | เลือกสินค้า ใส่จำนวน เลือก Event (จากชีท Config) และหมายเหตุ (ไม่บังคับ) |
| **เบิกสำหรับพนักงานใหม่** | เลือกพนักงานใหม่ที่ยังไม่ได้รับของ แล้วเบิกตามชุด (Bundle) ที่กำหนดไว้ เบิกได้หลายคนในครั้งเดียว |
| **เบิกสำหรับกิจกรรม** | เลือกพนักงานจากรายชื่อทั้งหมด แล้วเบิกของให้เป็นของกิจกรรม (ของกลุ่มนี้ไม่มีการคืน) |
| **เช็คสต็อกของ Onboarding** | ดูว่าสต็อกพอสำหรับชุดพนักงานใหม่หรือไม่ |

### คืนสินค้า (`/staff/returns`)

- คืนได้เฉพาะของที่ตัวเองเบิก (Admin / Admin2 คืนแทนคนอื่นได้)
- คืนบางส่วนได้ ระบบนับยอดคืนสะสมไม่ให้เกินจำนวนที่เบิก
- มีหน้าประวัติการคืนของตัวเอง

### ฝั่งแอดมิน

- **Dashboard** — ภาพรวมสต็อกและการเบิก
- **สินค้า** — เพิ่ม/แก้ไข/ลบสินค้า อัปโหลดรูปขึ้น Cloudinary ตั้งค่าเกณฑ์ "เหลือน้อย"
- **ชุดของพนักงานใหม่** — สร้าง Bundle และกำหนดรายการสินค้ากับจำนวนต่อชุด
- **พนักงานใหม่** — ดูรายชื่อ ค้นหา กรองตามช่วงวันที่เริ่มงาน
- **ประวัติการคืนสินค้า** — ใครเบิกอะไร คืนแล้วหรือยัง (ยังไม่คืน / คืนบางส่วน / คืนแล้ว)

### ฝั่งผู้ดูแลระบบ (Admin2)

- **จัดการผู้ใช้งาน** — สร้างบัญชี แก้ไข ระงับ ลบ (สร้างแล้วส่งอีเมลและแจ้ง LINE อัตโนมัติ)
- **ฐานข้อมูลพนักงานใหม่** — วางลิงก์ Google Sheet เพื่อดึงรายชื่อเข้าระบบ ดูสถานะการรับของรายคน และ Export เป็น CSV
- **ประวัติการเบิกของพนักงานใหม่**
- **ประวัติการแก้ไขระบบ (Audit Log)** — บันทึกว่าใครแก้อะไรกับผู้ใช้งาน

### การแจ้งเตือน

- การ์ด LINE (Flex Message) เข้ากลุ่ม HR เมื่อเบิกสำเร็จ / สต็อกไม่พอ / เบิกพนักงานใหม่ / สรุปเป็นชุด
- ส่งอีเมลผลการเบิกให้ผู้ใช้ที่ ACTIVE ทุกคน (ผ่าน Resend หรือ Brevo)
- พิมพ์ **`เช็คสต็อกของ`** ในแชต LINE เพื่อให้บอทตอบสรุปสต็อกสินค้าทั้งหมด

### หน้า Login

มีแอนิเมชันกล่องตกและรถยกวิ่งผ่านหน้าจอ รถคันแรกมาหลังเปิดหน้า 2 วินาที คันต่อไปมาหลังคันก่อนออกจอ 5–10 วินาที (แก้ได้ในฟังก์ชัน `ForkliftEvent` ใน `src/app/login/page.tsx`) และมีข้อความ "เลยเวลาแล้วงานนะครับพี่ๆ" ขึ้นหลัง 18:00 วันละครั้งต่อเบราว์เซอร์ (ปุ่ม "💬 จำลองข้อความ" ใช้ทดสอบข้อความนี้)

---

## สิทธิ์การใช้งาน (Role)

มี 3 ระดับ ระดับสูงกว่าใช้งานได้ทุกอย่างของระดับต่ำกว่า

| Role | หน้าที่เข้าได้ |
|---|---|
| **Staff** | `/staff/*` — เบิก, ประวัติการเบิก, คืนสินค้า, ดูและ Export ฐานข้อมูลพนักงานใหม่ |
| **Admin** | ทุกอย่างของ Staff + `/admin/*` — Dashboard, สินค้า, ชุดพนักงานใหม่, พนักงานใหม่, ประวัติการคืน |
| **Admin2** | ทุกอย่าง + `/admin2/*` — จัดการผู้ใช้, นำเข้าฐานข้อมูลพนักงานใหม่, Audit Log |

การป้องกันทำ 2 ชั้น: `src/middleware.ts` คุมตาม path และแต่ละ API route เช็ค role ซ้ำอีกครั้ง

---

## เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript |
| จัดรูปแบบ | Tailwind CSS v4 (ฟอนต์ Noto Sans Thai) |
| Auth | NextAuth (Credentials, JWT, อายุ session 8 ชั่วโมง) |
| ฐานข้อมูล | Google Sheets API (`googleapis`) |
| รูปสินค้า | Cloudinary |
| แจ้งเตือน | LINE Messaging API, Resend / Brevo |
| UI อื่นๆ | `lucide-react`, `framer-motion`, `react-hot-toast` |
| อื่นๆ | `bcryptjs`, `uuid`, `async-mutex`, `clsx`, `tailwind-merge` |

---

## โครงสร้างโปรเจกต์

```
src/
├── app/
│   ├── login/                    หน้าเข้าสู่ระบบ + แอนิเมชัน
│   ├── staff/
│   │   ├── requisition/          เบิกสินค้า (4 โหมด)
│   │   ├── history/              ประวัติการเบิกของตัวเอง
│   │   ├── returns/              คืนสินค้า (+ history/)
│   │   └── employee-database/    ดู/Export รายชื่อพนักงานใหม่
│   ├── admin/
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── employees/            รายชื่อพนักงานใหม่
│   │   ├── returns/              ประวัติการคืนสินค้า
│   │   └── settings/onboarding-bundles/
│   ├── admin2/
│   │   ├── users/                จัดการผู้ใช้งาน
│   │   ├── employee-database/    นำเข้า + ดู + Export
│   │   ├── onboarding-history/
│   │   ├── audit-log/
│   │   └── returns/              ใช้หน้าเดียวกับ admin/returns
│   └── api/                      ดูหัวข้อ API
├── components/
│   ├── Nav.tsx                   เมนู (แถบข้างบนคอม / ลิ้นชักบนมือถือ)
│   ├── EmployeeDatabaseView.tsx  ตารางพนักงานใหม่ (ใช้ร่วม Staff/Admin2)
│   ├── MobileField.tsx           ช่อง "ป้าย + ค่า" ในการ์ดมือถือ
│   ├── ConfirmDialog.tsx · HopLoader.tsx · LogoMark.tsx
│   └── PageTransitionOverlay.tsx · Providers.tsx
├── lib/
│   ├── sheets.ts                 ชั้นเข้าถึง Google Sheets ทั้งหมด
│   ├── notifications.ts          LINE + อีเมล
│   ├── auth.ts                   ตั้งค่า NextAuth
│   ├── background.ts             รันงานช้าๆ หลังตอบ response แล้ว
│   ├── auditFormat.ts · utils.ts
├── types/                        TypeScript types (User, Product, RequisitionLog ฯลฯ)
└── middleware.ts                 ตรวจ session และ role
```

---

## เริ่มต้นใช้งาน

> ไฟล์ที่ส่งมามีแค่โฟลเดอร์ `src/` (ไม่มี `package.json`) ส่วนนี้จึงเขียนตามแพ็กเกจที่โค้ดเรียกใช้จริง ถ้าโปรเจกต์ของคุณมี `package.json` อยู่แล้ว ข้ามขั้นตอนติดตั้งแพ็กเกจได้เลย

```bash
# 1. ติดตั้งแพ็กเกจ
npm install

# 2. สร้างไฟล์ .env.local แล้วใส่ค่าตามหัวข้อด้านล่าง

# 3. รันโหมดพัฒนา
npm run dev
```

เปิด <http://localhost:3000> ระบบจะพาไปหน้า `/login` ถ้ายังไม่ได้เข้าสู่ระบบ

**ข้อกำหนด:** Node.js 18 ขึ้นไป (โค้ดใช้ `after()` จาก `next/server` จึงต้องใช้ Next.js เวอร์ชันที่รองรับ)

**บัญชีแรก:** ยังไม่มีหน้าสมัครสมาชิก ให้เพิ่มแถวผู้ใช้คนแรกในแท็บ `Users` ของ Google Sheet ด้วยตัวเอง (`role` = `Admin2`, `status` = `ACTIVE`) หลังจากนั้นเข้าสู่ระบบแล้วสร้างบัญชีอื่นผ่านหน้า "จัดการผู้ใช้งาน" ได้

---

## ตัวแปรสภาพแวดล้อม (.env)

### จำเป็น

| ตัวแปร | ความหมาย |
|---|---|
| `NEXTAUTH_SECRET` | คีย์ลับสำหรับเซ็น session (สุ่มสตริงยาวๆ) |
| `NEXTAUTH_URL` | URL ของเว็บ เช่น `http://localhost:3000` (NextAuth ใช้ ตั้งตอน deploy) |
| `GOOGLE_SHEETS_ID` | ID ของ Google Spreadsheet ที่ใช้เป็นฐานข้อมูล |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | เนื้อหาไฟล์ Service Account ทั้งก้อน (JSON บรรทัดเดียว) |

### อัปโหลดรูปสินค้า

| ตัวแปร | ความหมาย |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | ชื่อ Cloud |
| `CLOUDINARY_API_KEY` | API Key |
| `CLOUDINARY_API_SECRET` | API Secret |

### LINE (ไม่ตั้ง = ไม่ส่งแจ้งเตือน LINE)

| ตัวแปร | ความหมาย |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | Token ของ LINE Official Account (Messaging API) |
| `LINE_CHANNEL_SECRET` | ใช้ตรวจลายเซ็น webhook |
| `LINE_HR_GROUP_ID` | ID กลุ่มที่จะรับการ์ดแจ้งเตือน |
| `LINE_NOTIFY_TOKEN` | Token LINE Notify (ฟังก์ชันเก่า ใช้เมื่อมีการเรียก `sendLineNotify`) |

### อีเมล (ไม่ตั้ง = ไม่ส่งอีเมล)

| ตัวแปร | ความหมาย |
|---|---|
| `EMAIL_PROVIDER` | `resend` หรือ `brevo` (ไม่ตั้ง: ใช้ Resend ถ้ามี `RESEND_API_KEY` ไม่งั้นใช้ Brevo) |
| `RESEND_API_KEY` · `RESEND_SENDER_EMAIL` | ค่าของ Resend |
| `BREVO_API_KEY` · `BREVO_SENDER_EMAIL` | ค่าของ Brevo |
| `NEXT_PUBLIC_APP_URL` | URL เว็บจริง ใช้ใส่ลิงก์ Login ในอีเมลบัญชีใหม่ |

### รายการ Event (ชีท Config)

| ตัวแปร | ค่าเริ่มต้น |
|---|---|
| `CONFIG_SPREADSHEET_ID` | ถ้าไม่ตั้ง โค้ดจะใช้ ID ที่ฝังไว้ใน `src/lib/sheets.ts` แล้วถอยไปใช้ `GOOGLE_SHEETS_ID` — **แนะนำให้ตั้งเป็นของคุณเอง** |
| `CONFIG_SHEET_NAME` | `Config` |
| `CONFIG_EVENT_HEADER` | `Event` |

ตัวอย่าง `.env.local`

```env
NEXTAUTH_SECRET=change-me
NEXTAUTH_URL=http://localhost:3000
GOOGLE_SHEETS_ID=1AbC...
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

---

## ตั้งค่า Google Sheets

1. สร้าง Service Account ใน Google Cloud เปิดใช้ **Google Sheets API** และ **Drive API** แล้วดาวน์โหลดไฟล์ JSON
2. สร้าง Spreadsheet แล้ว **แชร์ให้อีเมลของ Service Account** ด้วยสิทธิ์ Editor
3. สร้างแท็บตามตารางด้านล่าง โดยใส่ **หัวตารางแถวแรกให้ตรงทุกตัวอักษร** (เรียงตามลำดับนี้)

| แท็บ | หัวตาราง (แถวที่ 1) |
|---|---|
| `Users` | `id, name, email, username, password, role, status, employeeId, createdAt` |
| `Products` | `id, name, imageUrl, quantity, unit, category, lowStockThreshold, updatedAt, version` |
| `RequisitionLog` | `id, userId, userName, productId, productName, quantityRequested, quantityBefore, quantityAfter, eventName, status, isOnboarding, bundleId, employeeId, employeeName, createdAt, returnedQuantity, returnedAt, note, isActivity` |
| `AuditLog` | `id, actorId, actorName, action, targetUserId, detail, createdAt` |
| `OnboardingBundles` | `id, bundleName, description, isActive, createdAt` |
| `OnboardingBundleItems` | `id, bundleId, productId, productName, quantityPerSet` |
| `Data Newcomer` | `ลำดับ, บริษัท, เดือน, วันที่เริ่มงาน, รายชื่อพนักงาน, ตำแหน่ง, หน่วยงาน, id, employeeId, status, createdAt, C Level` |

> ในโค้ดมีฟังก์ชัน `ensureSheetHeaders()` ที่สร้างแท็บและหัวตารางให้อัตโนมัติ แต่ **ไม่ได้ถูกเรียกใช้ที่ไหนเลย** จึงต้องสร้างแท็บเอง หรือเรียกฟังก์ชันนี้ครั้งเดียวด้วยตัวเอง

**ค่าที่ใช้ในคอลัมน์**
- `role`: `Staff` / `Admin` / `Admin2`
- `status` (ผู้ใช้): `ACTIVE` / `SUSPENDED` / `DELETED` (ล็อกอินได้เฉพาะ `ACTIVE`)
- `status` (พนักงานใหม่): `PENDING` / `ONBOARDED`

### ชีท Config (รายการ Event)

ในสเปรดชีตที่ตั้งไว้ใน `CONFIG_SPREADSHEET_ID` สร้างแท็บชื่อ `Config` ที่มีคอลัมน์หัวข้อ `Event` แล้วใส่รายการ Event ลงไปทีละแถว หน้าเบิกของทั่วไปจะให้เลือกได้เฉพาะรายการเหล่านี้ (ไม่มีการพิมพ์เอง)

### นำเข้ารายชื่อพนักงานใหม่

Admin2 วางลิงก์ Google Sheet (ตั้งแชร์เป็น "ทุกคนที่มีลิงก์ดูได้") ในหน้า **ฐานข้อมูลพนักงานใหม่** ชีทต้นทางต้องมีแท็บ `Data Newcomer` และคอลัมน์: ลำดับ, บริษัท, เดือน, วันที่เริ่มงาน, รายชื่อพนักงาน, ตำแหน่ง, หน่วยงาน (ไม่บังคับ: รหัสพนักงาน, C Level)

---

## ตั้งค่า LINE

1. สร้าง LINE Official Account และเปิด Messaging API
2. นำ Channel Access Token กับ Channel Secret ไปใส่ใน `.env`
3. เชิญบอทเข้ากลุ่ม HR แล้วหา Group ID ใส่ `LINE_HR_GROUP_ID`
4. ใน LINE Developers Console ตั้ง Webhook URL เป็น `https://<โดเมนของคุณ>/api/line/webhook` แล้วเปิด **Use webhook**

เส้นทาง `/api/line/webhook` ไม่ต้องล็อกอิน (LINE เรียกเอง) แต่ตรวจลายเซ็น HMAC-SHA256 ทุกครั้ง ถ้าลายเซ็นไม่ตรงจะตอบ 401

---

## หลักการทำงานของระบบ

**Google Sheets เป็นฐานข้อมูล** — ทุกการอ่านเขียนผ่าน `src/lib/sheets.ts` มีกลไกดังนี้
- **แคช** ข้อมูลในหน่วยความจำ 15–30 วินาที (สินค้า 30 วิ, ผู้ใช้/ล็อก/ชีทเล็ก 15 วิ) และล้างแคชของแท็บนั้นทันทีเมื่อมีการเขียน
- **Mutex** ล็อกการตัดสต็อกให้ทำทีละรายการ ป้องกันสต็อกเพี้ยนเมื่อมีคนเบิกพร้อมกัน
- **Retry** ลองใหม่เมื่อ Google ตอบ 429 / 5xx / เครือข่ายหลุด ส่วนการเขียนจะ retry เฉพาะ 429 เพื่อไม่ให้เกิดแถวซ้ำ
- **Timeout** อ่าน 8 วินาที เขียน 15 วินาที

**การเบิก** — ตรวจสต็อกและตัดยอดตามเงื่อนไข บันทึกลง `RequisitionLog` (ยอดก่อน/หลัง) ถ้าสต็อกไม่พอจะแจ้ง LINE/อีเมลให้ทราบ ส่วนการเบิกพนักงานใหม่จะเปลี่ยนสถานะพนักงานเป็น `ONBOARDED`

**การคืน** — เพิ่มสต็อกกลับ และอัปเดต `returnedQuantity` / `returnedAt` ในแถวเดิมของ log

**งานแจ้งเตือน** — LINE และอีเมลรันผ่าน `runInBackground()` (`after()` ของ Next.js) หลังตอบผู้ใช้แล้ว ผู้ใช้จึงไม่ต้องรอ และถ้าส่งไม่สำเร็จก็ไม่กระทบผลการเบิก

**Login** — ตรวจ username/password จากแท็บ `Users` รองรับรหัสผ่านแบบข้อความธรรมดา และแบบ bcrypt (ขึ้นต้น `$2`) ถ้า Google Sheets ล่ม ระบบจะแจ้ง "ระบบขัดข้อง" แทนที่จะบอกว่ารหัสผิด

---

## API

ทุกเส้นทางต้องมี session (ไม่มี = ตอบ `401` เป็น JSON) ยกเว้น `/api/auth/*` และ `/api/line/webhook`

| เส้นทาง | Method | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| `/api/products` | GET | ทุกคน | รายการสินค้า |
| `/api/products` | POST, DELETE | Admin+ | เพิ่ม/แก้ไข (พร้อมอัปโหลดรูป) / ลบสินค้า |
| `/api/requisitions` | GET | ทุกคน | ประวัติการเบิก (Staff เห็นเฉพาะของตัวเอง) |
| `/api/requisitions` | POST | ทุกคน | เบิก/คืน แยกด้วย `mode`: `general` · `onboarding` · `activity` · `return` · `notify-summary` |
| `/api/returns/history` | GET | ทุกคน | ประวัติการคืน |
| `/api/event-categories` | GET | ทุกคน | รายการ Event จากชีท Config |
| `/api/bundles` | GET | ทุกคน | ชุดพนักงานใหม่ |
| `/api/bundles` | POST, PATCH, DELETE | Admin+ | จัดการชุดและรายการในชุด |
| `/api/employees` | GET | ทุกคน | รายชื่อพนักงานใหม่ (`?from=&to=` กรองตามวันเริ่มงาน) |
| `/api/employees` | POST | Admin2 | สร้างบัญชีผู้ใช้ใหม่ (ไม่ได้สร้างรายชื่อพนักงานใหม่) |
| `/api/employees/import` | POST | Admin2 | นำเข้ารายชื่อจากลิงก์ Google Sheet |
| `/api/employees/item-status` | GET | ทุกคน | สถานะการรับของรายคน |
| `/api/employees/onboarding-history` | GET | ทุกคน | ประวัติการเบิกของพนักงานใหม่ |
| `/api/users` | GET, PATCH, DELETE | Admin2 | จัดการผู้ใช้งาน |
| `/api/audit` | GET | Admin2 | Audit Log |
| `/api/line/webhook` | GET, POST | LINE | รับข้อความจาก LINE (ตรวจลายเซ็น) |

---

## การแสดงผลบนมือถือ

ใช้จุดตัดที่ 768px (`md:` ของ Tailwind)

| | 768px ขึ้นไป | แคบกว่า 768px |
|---|---|---|
| เมนู | แถบด้านซ้ายถาวร | แถบบน + ลิ้นชักเมนูเลื่อนจากซ้าย (แบ่งกลุ่ม มีข้อมูลผู้ใช้และปุ่มออกจากระบบ) |
| ตารางในหน้าแอดมิน | ตาราง | การ์ดเรียงลงมา (พนักงานใหม่, ประวัติการคืน, ประวัติเบิกพนักงานใหม่, ฐานข้อมูลพนักงานใหม่) |
| แท็บโหมดเบิกสินค้า | ชิปที่ตัดบรรทัดได้ | ชิปแถวเดียวปัดซ้าย-ขวาได้ |
| ป๊อปอัปในหน้าเบิกสินค้า | กล่องกลางจอ | แผงเลื่อนขึ้นจากล่างจอ |

ช่องกรอกข้อมูลบนมือถือบังคับขนาดตัวอักษร 16px ใน `globals.css` เพื่อไม่ให้ iPhone ซูมหน้าเองเมื่อแตะช่อง

---

## การ Deploy

ออกแบบมาสำหรับ **Vercel**
- ตั้งค่า Environment Variables ทั้งหมดในหน้า Project Settings
- API ที่เรียก Google Sheets ตั้ง `maxDuration = 30` ไว้ (ดูใน route แต่ละไฟล์) เผื่อ Google ตอบช้า
- งานแจ้งเตือนใช้ `after()` ซึ่งบน Vercel จะคงฟังก์ชันไว้จนงานเสร็จ
- เมื่อใช้โดเมนจริง ให้ตั้ง `NEXT_PUBLIC_APP_URL` และ `NEXTAUTH_URL` ให้ตรง และอัปเดต Webhook URL ของ LINE ด้วย

---

## ข้อควรระวังด้านความปลอดภัย

- **รหัสผ่านในชีท** — ระบบรองรับรหัสผ่านข้อความธรรมดาเพื่อความง่ายในการตั้งค่า ถ้าใช้งานจริงควรเก็บเป็น bcrypt hash (ขึ้นต้น `$2`) ระบบรองรับอยู่แล้ว
- **สิทธิ์เข้าถึงชีท** — แชร์สเปรดชีตให้เฉพาะ Service Account และผู้ดูแล เพราะข้อมูลผู้ใช้และรหัสผ่านอยู่ในชีทนี้
- **ไฟล์ลับ** — อย่านำ `.env.local` และ `GOOGLE_SERVICE_ACCOUNT_JSON` ขึ้น Git
- **Webhook LINE** — ต้องตั้ง `LINE_CHANNEL_SECRET` มิฉะนั้นระบบจะปฏิเสธทุกคำขอ (ตอบ 500)