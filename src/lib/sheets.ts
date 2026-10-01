import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import { Mutex } from "async-mutex";
import type {
  User,
  Product,
  RequisitionLog,
  AuditLog,
  OnboardingBundle,
  OnboardingBundleItem,
  Employee,
  Role,
  UserStatus,
  EmployeeStatus,
  RequisitionStatus,
  EmployeeItemStatusResult,
  ItemReceiveState,
  OverallReceiveState,
  ItemSource,
} from "@/types";

// ============ Config ============
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID || "";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

// Sheet names
const SHEETS = {
  USERS: "Users",
  PRODUCTS: "Products",
  REQUISITION_LOG: "RequisitionLog",
  AUDIT_LOG: "AuditLog",
  ONBOARDING_BUNDLES: "OnboardingBundles",
  ONBOARDING_BUNDLE_ITEMS: "OnboardingBundleItems",
  // Newcomer roster, synced in from an external Google Sheet by Admin2.
  DATA_NEWCOMER: "Data Newcomer",
} as const;

// Headers (must match exactly)
const HEADERS = {
  Users: ["id", "name", "email", "username", "password", "role", "status", "employeeId", "createdAt"],
  Products: ["id", "name", "imageUrl", "quantity", "unit", "category", "lowStockThreshold", "updatedAt", "version"],
  RequisitionLog: [
    "id", "userId", "userName", "productId", "productName", "quantityRequested",
    "quantityBefore", "quantityAfter", "eventName", "status", "isOnboarding",
    "bundleId", "employeeId", "employeeName", "createdAt", "returnedQuantity", "returnedAt",
    "note", "isActivity",
  ],
  AuditLog: ["id", "actorId", "actorName", "action", "targetUserId", "detail", "createdAt"],
  OnboardingBundles: ["id", "bundleName", "description", "isActive", "createdAt"],
  OnboardingBundleItems: ["id", "bundleId", "productId", "productName", "quantityPerSet"],
  // Visible/business columns match exactly what Admin2 asked for; the last
  // four columns are internal bookkeeping (kept at the end so the sheet
  // still reads naturally to a human opening it in Google Sheets).
  "Data Newcomer": [
    "ลำดับ",
    "บริษัท",
    "เดือน",
    "วันที่เริ่มงาน",
    "รายชื่อพนักงาน",
    "ตำแหน่ง",
    "หน่วยงาน",
    "id",
    "employeeId",
    "status",
    "createdAt",
    "C Level",
  ],
};

// Mutex for stock operations (serialize writes)
const stockMutex = new Mutex();

// Cache lifetimes. Reads are served from memory inside these windows; every
// write to a sheet clears that sheet's cache immediately (see
// invalidateSheetCaches), so the instance that wrote always reads fresh data.
// Other serverless instances catch up within the TTL.
const PRODUCTS_TTL_MS = 30_000;
const USERS_TTL_MS = 15_000;
const LOGS_TTL_MS = 15_000;
const SMALL_SHEET_TTL_MS = 15_000; // employees, audit, bundles
const READ_TIMEOUT_MS = 8_000;
const WRITE_TIMEOUT_MS = 15_000;

// ============ Auth Client ============
function createAuth() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentials) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  }
  const parsed = JSON.parse(credentials);
  const auth = new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: SCOPES,
  });
  return auth;
}

// Cache the auth object (type inferred from createAuth so it stays
// GoogleAuth<JSONClient>, which google.sheets()/google.drive() accept).
let cachedAuth: ReturnType<typeof createAuth> | null = null;
let cachedSheets: ReturnType<typeof google.sheets> | null = null;

function getAuth() {
  if (!cachedAuth) cachedAuth = createAuth();
  return cachedAuth;
}

async function getSheetsClient() {
  // Reuse one client so the OAuth access token is cached and refreshed only
  // when it expires (previously every sheet read requested a new token).
  if (!cachedSheets) cachedSheets = google.sheets({ version: "v4", auth: getAuth() });
  return cachedSheets;
}

async function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: "v3", auth });
}

// ============ Helpers ============
function parseNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(String(val).trim());
  return Number.isFinite(n) ? n : fallback;
}

function parseBoolean(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  const s = String(val ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function rowToObject<T extends Record<string, unknown>>(
  headers: string[],
  row: unknown[]
): T {
  const obj: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    obj[h] = row[i] ?? "";
  });
  return obj as T;
}

// Retry transient Google API errors (429 quota, 5xx, network resets).
// rateLimitOnly: for writes - only retry when Google REJECTED the call (429),
// never after a timeout/5xx where the write may have gone through (a retried
// append could otherwise create a duplicate row).
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, rateLimitOnly = false): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const e = err as { code?: number | string; status?: number };
      const code = Number(e?.code ?? e?.status);
      const transient = rateLimitOnly
        ? code === 429
        : code === 429 ||
          (code >= 500 && code < 600) ||
          ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN", "ENOTFOUND"].includes(String(e?.code));
      if (!transient || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i)); // 400ms, 800ms
    }
  }
  throw lastErr;
}

async function getSheetData(sheetName: string, range?: string): Promise<string[][]> {
  const sheets = await getSheetsClient();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get(
      {
        spreadsheetId: SPREADSHEET_ID,
        range: range ? `${sheetName}!${range}` : sheetName,
      },
      { timeout: READ_TIMEOUT_MS } // never let one hung Google call block a request for 20s+
    )
  );
  return (res.data.values as string[][]) || [];
}

// ---- Generic cached reader (one Google read shared by everyone) ----
const sheetCache = new Map<string, { data: string[][]; ts: number }>();
const sheetInflight = new Map<string, Promise<string[][]>>();
const sheetGen = new Map<string, number>(); // bumped on every write to that sheet

async function getSheetDataCached(sheetName: string, ttlMs: number, force = false): Promise<string[][]> {
  const hit = sheetCache.get(sheetName);
  if (!force && hit && Date.now() - hit.ts < ttlMs) return hit.data;
  if (!force) {
    const running = sheetInflight.get(sheetName);
    if (running) return running; // de-duplicate concurrent reads
  }
  const gen = sheetGen.get(sheetName) || 0;
  const load = getSheetData(sheetName).then((d) => {
    // A write that landed while we were reading makes this snapshot stale -
    // hand it to the caller but do not cache it.
    if ((sheetGen.get(sheetName) || 0) === gen) sheetCache.set(sheetName, { data: d, ts: Date.now() });
    return d;
  });
  sheetInflight.set(sheetName, load);
  try {
    return await load;
  } catch (err) {
    // Google failed/timed out: keep the app working from the last good copy
    // (except when the caller explicitly demanded fresh data).
    if (!force && hit) return hit.data;
    throw err;
  } finally {
    if (sheetInflight.get(sheetName) === load) sheetInflight.delete(sheetName);
  }
}

// Clear cached copies of one sheet (or all when no name is given).
function invalidateSheetCaches(sheetName?: string) {
  const names: string[] = sheetName ? [sheetName] : Object.values(SHEETS);
  for (const n of names) {
    sheetGen.set(n, (sheetGen.get(n) || 0) + 1);
    sheetCache.delete(n);
    sheetInflight.delete(n);
  }
}

export function invalidateProductsCache() {
  invalidateSheetCaches(SHEETS.PRODUCTS);
}

function invalidateLogsCache() {
  invalidateSheetCaches(SHEETS.REQUISITION_LOG);
}

export function invalidateBundlesCache() {
  invalidateSheetCaches(SHEETS.ONBOARDING_BUNDLES);
  invalidateSheetCaches(SHEETS.ONBOARDING_BUNDLE_ITEMS);
}

async function appendRows(sheetName: string, rows: unknown[][]): Promise<void> {
  if (!rows.length) return;
  const sheets = await getSheetsClient();
  try {
    await withRetry(
      () =>
        sheets.spreadsheets.values.append(
          {
            spreadsheetId: SPREADSHEET_ID,
            range: sheetName,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: rows },
          },
          { timeout: WRITE_TIMEOUT_MS }
        ),
      3,
      true
    );
  } finally {
    invalidateSheetCaches(sheetName);
  }
}

async function updateRow(
  sheetName: string,
  rowIndex: number, // 1-based including header
  values: unknown[]
): Promise<void> {
  const sheets = await getSheetsClient();
  try {
    await withRetry(
      () =>
        sheets.spreadsheets.values.update(
          {
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [values] },
          },
          { timeout: WRITE_TIMEOUT_MS }
        ),
      3,
      true
    );
  } finally {
    invalidateSheetCaches(sheetName);
  }
}

// Update many rows of one sheet in a SINGLE Google call.
async function batchUpdateRows(
  sheetName: string,
  updates: { rowIndex: number; values: unknown[] }[]
): Promise<void> {
  if (!updates.length) return;
  const sheets = await getSheetsClient();
  try {
    await withRetry(
      () =>
        sheets.spreadsheets.values.batchUpdate(
          {
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              valueInputOption: "USER_ENTERED",
              data: updates.map((u) => ({
                range: `${sheetName}!A${u.rowIndex}`,
                values: [u.values],
              })),
            },
          },
          { timeout: WRITE_TIMEOUT_MS }
        ),
      3,
      true
    );
  } finally {
    invalidateSheetCaches(sheetName);
  }
}

// Tab ids never change, so look each one up once per instance.
const sheetIdCache = new Map<string, number>();

async function getSheetIdByName(sheetName: string): Promise<number> {
  const cached = sheetIdCache.get(sheetName);
  if (cached !== undefined) return cached;
  const sheets = await getSheetsClient();
  const meta = await withRetry(() =>
    sheets.spreadsheets.get(
      { spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties(sheetId,title)" },
      { timeout: READ_TIMEOUT_MS }
    )
  );
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
  if (!sheet || sheet.properties?.sheetId == null) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  sheetIdCache.set(sheetName, sheet.properties.sheetId);
  return sheet.properties.sheetId;
}

async function deleteRow(sheetName: string, rowIndex: number): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = await getSheetIdByName(sheetName);
  try {
    await withRetry(
      () =>
        sheets.spreadsheets.batchUpdate(
          {
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId,
                      dimension: "ROWS",
                      startIndex: rowIndex - 1, // 0-based
                      endIndex: rowIndex,
                    },
                  },
                },
              ],
            },
          },
          { timeout: WRITE_TIMEOUT_MS }
        ),
      3,
      true
    );
  } finally {
    invalidateSheetCaches(sheetName);
  }
}

async function findRowIndex(
  sheetName: string,
  idColumn: string,
  idValue: string
): Promise<number | null> {
  const data = await getSheetData(sheetName);
  if (data.length < 2) return null;
  const headers = data[0];
  const idIdx = headers.indexOf(idColumn);
  if (idIdx === -1) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(idValue).trim()) {
      return i + 1; // 1-based
    }
  }
  return null;
}

// ============ Users ============
export async function getUsers(): Promise<User[]> {
  const data = await getSheetDataCached(SHEETS.USERS, USERS_TTL_MS);
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map((row) => mapUserRow(headers, row));
}

function mapUserRow(headers: string[], row: unknown[]): User {
  const raw = rowToObject<Record<string, string>>(headers, row);
  return {
    id: raw.id || "",
    name: raw.name || "",
    email: raw.email || "",
    username: raw.username || "",
    password: raw.password || "",
    role: (raw.role as Role) || "Staff",
    status: (raw.status as UserStatus) || "ACTIVE",
    employeeId: raw.employeeId || "",
    createdAt: raw.createdAt || "",
  };
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase() && u.status === "ACTIVE") || null;
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.id === id) || null;
}

export async function createUser(user: Omit<User, "id" | "createdAt"> & { id?: string }): Promise<User> {
  const id = user.id || uuidv4();
  const createdAt = new Date().toISOString();
  const row = [
    id,
    user.name,
    user.email,
    user.username,
    user.password,
    user.role,
    user.status || "ACTIVE",
    user.employeeId || "",
    createdAt,
  ];
  await appendRows(SHEETS.USERS, [row]);
  return { ...user, id, createdAt, status: user.status || "ACTIVE" };
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  // ONE fresh read (was: fresh read + cached read). Merging onto fresh data
  // means a stale cache can never overwrite someone else's recent edit.
  const data = await getSheetData(SHEETS.USERS);
  if (data.length < 2) return null;
  const headers = data[0];
  const idIdx = headers.indexOf("id");
  let rowIndex = -1;
  let current: User | null = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(id).trim()) {
      rowIndex = i + 1;
      current = mapUserRow(headers, data[i]);
      break;
    }
  }
  if (!current || rowIndex === -1) return null;
  const merged = { ...current, ...updates };
  const values = [
    merged.id,
    merged.name,
    merged.email,
    merged.username,
    merged.password,
    merged.role,
    merged.status,
    merged.employeeId,
    merged.createdAt,
  ];
  await updateRow(SHEETS.USERS, rowIndex, values);
  return merged;
}

export async function deleteUser(id: string): Promise<boolean> {
  const data = await getSheetData(SHEETS.USERS);
  if (data.length < 2) return false;
  const headers = data[0];
  const idIdx = headers.indexOf("id");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === id) {
      await deleteRow(SHEETS.USERS, i + 1);
      return true;
    }
  }
  return false;
}

// ============ Products + Cache ============
function mapProductRow(headers: string[], row: unknown[]): Product {
  const raw = rowToObject<Record<string, string>>(headers, row);
  return {
    id: raw.id || "",
    name: raw.name || "",
    imageUrl: raw.imageUrl || "",
    quantity: parseNumber(raw.quantity),
    unit: raw.unit || "",
    category: raw.category || "",
    lowStockThreshold: parseNumber(raw.lowStockThreshold),
    updatedAt: raw.updatedAt || "",
    version: parseNumber(raw.version, 1),
  };
}

export async function getProducts(forceRefresh = false): Promise<Product[]> {
  const data = await getSheetDataCached(SHEETS.PRODUCTS, PRODUCTS_TTL_MS, forceRefresh);
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map((row) => mapProductRow(headers, row));
}

export async function getProductById(id: string, forceRefresh = false): Promise<Product | null> {
  const products = await getProducts(forceRefresh);
  return products.find((p) => p.id === id) || null;
}

export async function createProduct(product: Omit<Product, "id" | "updatedAt" | "version">): Promise<Product> {
  const id = uuidv4();
  const updatedAt = new Date().toISOString();
  const version = 1;
  const row = [
    id,
    product.name,
    product.imageUrl || "",
    product.quantity,
    product.unit,
    product.category,
    product.lowStockThreshold,
    updatedAt,
    version,
  ];
  await appendRows(SHEETS.PRODUCTS, [row]);
  invalidateProductsCache();
  return { ...product, id, updatedAt, version };
}

export async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, "id" | "version">>,
  expectedVersion?: number
): Promise<{ success: boolean; product?: Product; error?: string }> {
  return stockMutex.runExclusive(async () => {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const data = await getSheetData(SHEETS.PRODUCTS);
      if (data.length < 2) return { success: false, error: "No products found" };
      const headers = data[0];
      const idIdx = headers.indexOf("id");
      const versionIdx = headers.indexOf("version");
      let rowIndex = -1;
      let current: Product | null = null;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idIdx]).trim() === id) {
          rowIndex = i + 1;
          current = mapProductRow(headers, data[i]);
          break;
        }
      }
      if (!current || rowIndex === -1) return { success: false, error: "Product not found" };

      if (expectedVersion !== undefined && current.version !== expectedVersion) {
        // Version mismatch – retry
        continue;
      }

      const merged: Product = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
        version: current.version + 1,
      };
      const values = [
        merged.id,
        merged.name,
        merged.imageUrl,
        merged.quantity,
        merged.unit,
        merged.category,
        merged.lowStockThreshold,
        merged.updatedAt,
        merged.version,
      ];
      await updateRow(SHEETS.PRODUCTS, rowIndex, values);
      invalidateProductsCache();
      return { success: true, product: merged };
    }
    return { success: false, error: "Optimistic lock failed after retries" };
  });
}

export async function deleteProduct(id: string): Promise<boolean> {
  // Soft approach: we can clear the row or leave a mark. For simplicity mark quantity=-1 or remove via API
  // Google Sheets delete requires batchUpdate with deleteDimension. Simpler: set status via quantity or just leave.
  // For now, we update name to [DELETED] and quantity 0
  const result = await updateProduct(id, { name: `[DELETED] ${id}`, quantity: 0 });
  return result.success;
}

// ============ Stock Deduction with Optimistic Locking ============
export async function deductStock(
  productId: string,
  quantity: number,
  meta: {
    userId: string;
    userName: string;
    eventName: string;
    isOnboarding?: boolean;
    bundleId?: string;
    employeeId?: string;
    employeeName?: string;
    note?: string;
  }
): Promise<{ success: boolean; log?: RequisitionLog; error?: string; currentQty?: number }> {
  return stockMutex.runExclusive(async () => {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const data = await getSheetData(SHEETS.PRODUCTS);
      if (data.length < 2) return { success: false, error: "No products" };
      const headers = data[0];
      const idIdx = headers.indexOf("id");
      let rowIndex = -1;
      let current: Product | null = null;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idIdx]).trim() === productId) {
          rowIndex = i + 1;
          current = mapProductRow(headers, data[i]);
          break;
        }
      }
      if (!current || rowIndex === -1) {
        return { success: false, error: "Product not found" };
      }

      if (current.quantity < quantity) {
        // Log failed attempt
        const failedLog: RequisitionLog = {
          id: uuidv4(),
          userId: meta.userId,
          userName: meta.userName,
          productId,
          productName: current.name,
          quantityRequested: quantity,
          quantityBefore: current.quantity,
          quantityAfter: current.quantity,
          eventName: meta.eventName,
          status: "FAILED",
          isOnboarding: !!meta.isOnboarding,
          bundleId: meta.bundleId || "",
          employeeId: meta.employeeId || "",
          employeeName: meta.employeeName || "",
          createdAt: new Date().toISOString(),
          returnedQuantity: 0,
          note: meta.note || "",
          isActivity: false,
        };
        await appendRequisitionLog(failedLog);
        return {
          success: false,
          error: "Insufficient stock",
          currentQty: current.quantity,
          log: failedLog,
        };
      }

      const newQty = current.quantity - quantity;
      const newVersion = current.version + 1;
      const updatedAt = new Date().toISOString();
      const values = [
        current.id,
        current.name,
        current.imageUrl,
        newQty,
        current.unit,
        current.category,
        current.lowStockThreshold,
        updatedAt,
        newVersion,
      ];

      // Write product
      await updateRow(SHEETS.PRODUCTS, rowIndex, values);

      // Write log
      const log: RequisitionLog = {
        id: uuidv4(),
        userId: meta.userId,
        userName: meta.userName,
        productId,
        productName: current.name,
        quantityRequested: quantity,
        quantityBefore: current.quantity,
        quantityAfter: newQty,
        eventName: meta.eventName,
        status: "SUCCESS",
        isOnboarding: !!meta.isOnboarding,
        bundleId: meta.bundleId || "",
        employeeId: meta.employeeId || "",
        employeeName: meta.employeeName || "",
        createdAt: updatedAt,
        returnedQuantity: 0,
        note: meta.note || "",
        isActivity: false,
      };
      await appendRequisitionLog(log);
      invalidateProductsCache();
      return { success: true, log };
    }
    return { success: false, error: "Optimistic lock / race condition failed after retries" };
  });
}

// Batch for onboarding with partial support.
// Google calls: 1 read + 1 batched product write + 1 batched log append,
// no matter how many items (previously 3 sequential calls PER item).
export async function deductStockBatch(
  items: { productId: string; quantity: number }[],
  meta: {
    userId: string;
    userName: string;
    eventName: string;
    isOnboarding: boolean;
    bundleId: string;
    employeeId: string;
    employeeName: string;
    // true = เบิกสำหรับกิจกรรม: logged as isActivity (NOT isOnboarding), never returnable.
    isActivity?: boolean;
  },
  allowPartial = false
): Promise<{
  success: boolean;
  results: { productId: string; success: boolean; error?: string; log?: RequisitionLog }[];
  error?: string;
}> {
  return stockMutex.runExclusive(async () => {
    // One fresh read of the Products sheet (rows + current quantities).
    const data = await getSheetData(SHEETS.PRODUCTS);
    const rowById = new Map<string, number>();
    const productById = new Map<string, Product>();
    if (data.length >= 2) {
      const headers = data[0];
      const idIdx = headers.indexOf("id");
      for (let i = 1; i < data.length; i++) {
        const id = String(data[i][idIdx] ?? "").trim();
        if (!id || rowById.has(id)) continue;
        rowById.set(id, i + 1);
        productById.set(id, mapProductRow(headers, data[i]));
      }
    }

    // First pass: check all quantities
    const checks: { product: Product; qty: number }[] = [];
    const insufficient: string[] = [];
    for (const item of items) {
      const p = productById.get(item.productId);
      if (!p) {
        return {
          success: false,
          results: [],
          error: `Product ${item.productId} not found`,
        };
      }
      if (p.quantity < item.quantity) {
        insufficient.push(`${p.name} (มี ${p.quantity}, ขอ ${item.quantity})`);
      }
      checks.push({ product: p, qty: item.quantity });
    }

    if (insufficient.length > 0 && !allowPartial) {
      return {
        success: false,
        results: [],
        error: `ของไม่พอ: ${insufficient.join(", ")}`,
      };
    }

    // Second pass: compute everything in memory (running totals also keep a
    // product that appears twice in the list correct).
    const now = new Date().toISOString();
    const state = new Map<string, { qty: number; version: number }>();
    const pendingWrites = new Map<number, unknown[]>(); // rowIndex -> row values
    const logs: RequisitionLog[] = [];
    const results: { productId: string; success: boolean; error?: string; log?: RequisitionLog }[] = [];

    for (const { product, qty } of checks) {
      const cur = state.get(product.id) || { qty: product.quantity, version: product.version };
      const base = {
        id: uuidv4(),
        userId: meta.userId,
        userName: meta.userName,
        productId: product.id,
        productName: product.name,
        quantityRequested: qty,
        quantityBefore: cur.qty,
        eventName: meta.eventName,
        isOnboarding: !meta.isActivity,
        isActivity: !!meta.isActivity,
        note: "",
        bundleId: meta.bundleId,
        employeeId: meta.employeeId,
        employeeName: meta.employeeName,
        createdAt: now,
        returnedQuantity: 0,
      };

      if (cur.qty < qty) {
        const failedLog: RequisitionLog = { ...base, quantityAfter: cur.qty, status: "FAILED" };
        logs.push(failedLog);
        results.push({ productId: product.id, success: false, error: "Insufficient", log: failedLog });
        continue;
      }

      const newQty = cur.qty - qty;
      const newVersion = cur.version + 1;
      state.set(product.id, { qty: newQty, version: newVersion });
      pendingWrites.set(rowById.get(product.id)!, [
        product.id,
        product.name,
        product.imageUrl,
        newQty,
        product.unit,
        product.category,
        product.lowStockThreshold,
        now,
        newVersion,
      ]);
      const log: RequisitionLog = { ...base, quantityAfter: newQty, status: "SUCCESS" };
      logs.push(log);
      results.push({ productId: product.id, success: true, log });
    }

    // Stock first, then the log trail (same order as before). If the stock
    // write fails nothing is logged, so the sheets stay consistent.
    await batchUpdateRows(
      SHEETS.PRODUCTS,
      [...pendingWrites.entries()].map(([rowIndex, values]) => ({ rowIndex, values }))
    );
    await appendRequisitionLogs(logs);

    const allSuccess = results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);

    return {
      success: allSuccess || (allowPartial && anySuccess),
      results,
      error: allSuccess ? undefined : "Some items failed",
    };
  });
}

function requisitionLogToRow(log: RequisitionLog): unknown[] {
  return [
    log.id,
    log.userId,
    log.userName,
    log.productId,
    log.productName,
    log.quantityRequested,
    log.quantityBefore,
    log.quantityAfter,
    log.eventName,
    log.status,
    log.isOnboarding ? "TRUE" : "FALSE",
    log.bundleId,
    log.employeeId,
    log.employeeName,
    log.createdAt,
    log.returnedQuantity || 0,
    log.returnedAt || "",
    log.note || "",
    log.isActivity ? "TRUE" : "FALSE",
  ];
}

// Shared by getRequisitionLogs() and returnStockItem() so every column
// (incl. note / isActivity) is always read and written back consistently.
function mapLogRaw(raw: Record<string, string>): RequisitionLog {
  return {
    id: raw.id || "",
    userId: raw.userId || "",
    userName: raw.userName || "",
    productId: raw.productId || "",
    productName: raw.productName || "",
    quantityRequested: parseNumber(raw.quantityRequested),
    quantityBefore: parseNumber(raw.quantityBefore),
    quantityAfter: parseNumber(raw.quantityAfter),
    eventName: raw.eventName || "",
    status: (raw.status as RequisitionStatus) || "SUCCESS",
    isOnboarding: parseBoolean(raw.isOnboarding),
    bundleId: raw.bundleId || "",
    employeeId: raw.employeeId || "",
    employeeName: raw.employeeName || "",
    createdAt: raw.createdAt || "",
    returnedQuantity: parseNumber(raw.returnedQuantity, 0),
    returnedAt: raw.returnedAt || undefined,
    note: raw.note || "",
    // Also recognise activity rows by their eventName, so they still count as
    // activity if the "isActivity" column/header is missing in the sheet.
    isActivity:
      parseBoolean(raw.isActivity) || (raw.eventName || "").startsWith("เบิกสำหรับกิจกรรม -"),
  };
}

// The RequisitionLog tab was created before the "note" / "isActivity"
// columns existed. Make sure their headers are in row 1 (once per server
// instance) so the new values land under a named column.
let logHeadersChecked = false;
async function ensureLogHeaders(): Promise<void> {
  if (logHeadersChecked) return;
  try {
    const head = await getSheetData(SHEETS.REQUISITION_LOG, "A1:Z1");
    const cur = (head[0] || []).map((h) => String(h).trim());
    const want = HEADERS.RequisitionLog;
    if (cur.length && cur.length < want.length && want.slice(0, cur.length).every((h, i) => h === cur[i])) {
      const sheets = await getSheetsClient();
      await sheets.spreadsheets.values.update(
        {
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEETS.REQUISITION_LOG}!A1`,
          valueInputOption: "RAW",
          requestBody: { values: [want] },
        },
        { timeout: WRITE_TIMEOUT_MS }
      );
      invalidateLogsCache();
    }
    logHeadersChecked = true;
  } catch (e) {
    console.warn("ensureLogHeaders failed", e);
  }
}

async function appendRequisitionLogs(logs: RequisitionLog[]): Promise<void> {
  await ensureLogHeaders();
  await appendRows(SHEETS.REQUISITION_LOG, logs.map(requisitionLogToRow));
}

async function appendRequisitionLog(log: RequisitionLog): Promise<void> {
  await appendRequisitionLogs([log]);
}

// ============ Requisition Logs ============
// Short-lived cache + in-flight de-duplication for the (large) log sheet so
// concurrent/rapid page loads share one Google Sheets read.
async function getLogsSheetData(): Promise<string[][]> {
  return getSheetDataCached(SHEETS.REQUISITION_LOG, LOGS_TTL_MS);
}

export async function getRequisitionLogs(filters?: {
  userId?: string;
  isOnboarding?: boolean;
}): Promise<RequisitionLog[]> {
  const data = await getLogsSheetData();
  if (data.length < 2) return [];
  const headers = data[0];
  let logs = data.slice(1).map((row) => mapLogRaw(rowToObject<Record<string, string>>(headers, row)));
  if (filters?.userId) logs = logs.filter((l) => l.userId === filters.userId);
  if (filters?.isOnboarding !== undefined) logs = logs.filter((l) => l.isOnboarding === filters.isOnboarding);
  // newest first
  logs.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return logs;
}

// ============ Returns ============
// Returns part or all of a previous requisition back into stock. Adds the
// quantity back onto the product row and marks it as returned on the
// original RequisitionLog row (returnedQuantity), so the same log can be
// used to derive "returned / partially returned / not returned yet".
export async function returnStockItem(
  logId: string,
  quantity: number,
  actor: { userId: string; userName: string }
): Promise<{ success: boolean; error?: string; log?: RequisitionLog; product?: Product }> {
  return stockMutex.runExclusive(async () => {
    // 1) Locate & validate the original requisition log row
    // Both sheets are read at the same time (was one after the other).
    const [logData, productData] = await Promise.all([
      getSheetData(SHEETS.REQUISITION_LOG),
      getSheetData(SHEETS.PRODUCTS),
    ]);
    if (logData.length < 2) return { success: false, error: "ไม่พบประวัติการเบิก" };
    const logHeaders = logData[0];
    const idIdx = logHeaders.indexOf("id");
    let logRowIndex = -1;
    let logRaw: Record<string, string> | null = null;
    for (let i = 1; i < logData.length; i++) {
      if (String(logData[i][idIdx]).trim() === logId) {
        logRowIndex = i + 1;
        logRaw = rowToObject<Record<string, string>>(logHeaders, logData[i]);
        break;
      }
    }
    if (!logRaw || logRowIndex === -1) return { success: false, error: "ไม่พบรายการเบิกนี้" };

    const currentLog: RequisitionLog = mapLogRaw(logRaw);

    if (currentLog.isActivity) {
      return { success: false, error: "การเบิกสำหรับกิจกรรมไม่ต้องคืนสินค้า" };
    }
    if (currentLog.status !== "SUCCESS") {
      return { success: false, error: "เบิกรายการนี้ไม่สำเร็จ จึงคืนของไม่ได้" };
    }
    const remaining = currentLog.quantityRequested - currentLog.returnedQuantity;
    if (quantity <= 0 || quantity > remaining) {
      return { success: false, error: `จำนวนที่คืนต้องมากกว่า 0 และไม่เกิน ${remaining}` };
    }

    // 2) Add the quantity back onto the product row
    const productHeaders = productData[0] || [];
    const pIdIdx = productHeaders.indexOf("id");
    let productRowIndex = -1;
    let product: Product | null = null;
    for (let i = 1; i < productData.length; i++) {
      if (String(productData[i][pIdIdx]).trim() === currentLog.productId) {
        productRowIndex = i + 1;
        product = mapProductRow(productHeaders, productData[i]);
        break;
      }
    }
    if (!product || productRowIndex === -1) {
      return { success: false, error: "ไม่พบสินค้านี้ในระบบแล้ว" };
    }

    const newQty = product.quantity + quantity;
    const updatedAt = new Date().toISOString();
    await updateRow(SHEETS.PRODUCTS, productRowIndex, [
      product.id,
      product.name,
      product.imageUrl,
      newQty,
      product.unit,
      product.category,
      product.lowStockThreshold,
      updatedAt,
      product.version + 1,
    ]);
    invalidateProductsCache();

    // 3) Update the original log's returnedQuantity + returnedAt (timestamp
    // of this — the most recent — return action against this requisition)
    const returnedAt = new Date().toISOString();
    const updatedLog: RequisitionLog = {
      ...currentLog,
      returnedQuantity: currentLog.returnedQuantity + quantity,
      returnedAt,
    };
    const logWrite = updateRow(SHEETS.REQUISITION_LOG, logRowIndex, [
      updatedLog.id,
      updatedLog.userId,
      updatedLog.userName,
      updatedLog.productId,
      updatedLog.productName,
      updatedLog.quantityRequested,
      updatedLog.quantityBefore,
      updatedLog.quantityAfter,
      updatedLog.eventName,
      updatedLog.status,
      updatedLog.isOnboarding ? "TRUE" : "FALSE",
      updatedLog.bundleId,
      updatedLog.employeeId,
      updatedLog.employeeName,
      updatedLog.createdAt,
      updatedLog.returnedQuantity,
      updatedLog.returnedAt,
      updatedLog.note || "",
      updatedLog.isActivity ? "TRUE" : "FALSE",
    ]);

    // 4) Audit trail (written at the same time as the log update)
    const auditWrite = appendAuditLog({
      actorId: actor.userId,
      actorName: actor.userName,
      action: "RETURN_ITEM",
      targetUserId: currentLog.userId,
      detail: `คืน ${currentLog.productName} จำนวน ${quantity} ${product.unit} (เบิกโดย ${currentLog.userName} เมื่อ ${currentLog.createdAt})`,
    });
    await Promise.all([logWrite, auditWrite]);

    return {
      success: true,
      log: updatedLog,
      product: { ...product, quantity: newQty, updatedAt, version: product.version + 1 },
    };
  });
}

// ============ Newcomers (Data Newcomer) ============
// This roster is owned by an external Google Sheet that Admin2 links from
// "ฐานข้อมูลพนักงานใหม่" (see importNewcomersFromSheet below). Creating a
// login account (Admin2 > จัดการผู้ใช้งาน) never writes here.
function rowToEmployee(row: Record<string, string>): Employee {
  return {
    id: row.id || "",
    employeeId: row.employeeId || "",
    order: cleanField(row["ลำดับ"]),
    company: cleanField(row["บริษัท"]),
    month: cleanField(row["เดือน"]),
    startDate: cleanField(row["วันที่เริ่มงาน"]),
    fullName: cleanField(row["รายชื่อพนักงาน"]),
    position: cleanField(row["ตำแหน่ง"]),
    // cleanField collapses any stray newline/double-space that snuck into
    // this cell (e.g. from a wrapped cell in the source Google Sheet), which
    // is what made "หน่วยงาน" render oddly for some rows.
    department: cleanField(row["หน่วยงาน"]),
    cLevel: cleanField(row["C Level"]),
    status: (row.status as EmployeeStatus) || "PENDING",
    createdAt: row.createdAt || "",
  };
}

function employeeToRow(emp: Employee): unknown[] {
  return [
    emp.order,
    emp.company,
    emp.month,
    emp.startDate,
    emp.fullName,
    emp.position,
    emp.department,
    emp.id,
    emp.employeeId,
    emp.status || "PENDING",
    emp.createdAt,
    emp.cLevel || "",
  ];
}

// Lightweight, targeted version of ensureSheetHeaders() that only touches the
// "Data Newcomer" tab. Used to self-heal on the very first read/write if the
// tab hasn't been created yet, without waiting for a manual sync.
async function ensureNewcomerSheetExists(): Promise<void> {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = (meta.data.sheets || []).some(
    (s) => s.properties?.title === SHEETS.DATA_NEWCOMER
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEETS.DATA_NEWCOMER } } }],
      },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.DATA_NEWCOMER}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [HEADERS["Data Newcomer"]] },
  });
  invalidateSheetCaches(SHEETS.DATA_NEWCOMER);
}

export async function getEmployees(forceRefresh = false): Promise<Employee[]> {
  let data: string[][];
  try {
    data = await getSheetDataCached(SHEETS.DATA_NEWCOMER, SMALL_SHEET_TTL_MS, forceRefresh);
  } catch (e) {
    // Tab doesn't exist yet ("Unable to parse range: Data Newcomer") — create
    // it with headers so the next call (and the Sheets UI) works normally,
    // and return an empty roster for this request instead of a 500.
    console.warn('"Data Newcomer" sheet not found yet, creating it now.', e);
    await ensureNewcomerSheetExists();
    return [];
  }
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map((row) => rowToEmployee(rowToObject<Record<string, string>>(headers, row)));
}

export async function getEmployeeByEmployeeId(
  employeeId: string,
  forceRefresh = false
): Promise<Employee | null> {
  const emps = await getEmployees(forceRefresh);
  return emps.find((e) => e.employeeId === employeeId) || null;
}

export async function createEmployee(
  emp: Omit<Employee, "id" | "createdAt"> & { id?: string }
): Promise<Employee> {
  const id = emp.id || uuidv4();
  const createdAt = new Date().toISOString();
  const full: Employee = {
    ...emp,
    id,
    createdAt,
    status: emp.status || "PENDING",
    employeeId: emp.employeeId || `NEW-${id.slice(0, 8)}`,
  };
  await appendRows(SHEETS.DATA_NEWCOMER, [employeeToRow(full)]);
  return full;
}

export async function updateEmployeeStatus(employeeId: string, status: EmployeeStatus): Promise<boolean> {
  // ONE fresh read, merge onto the fresh row (was: fresh read + cached read).
  const data = await getSheetData(SHEETS.DATA_NEWCOMER);
  if (data.length < 2) return false;
  const headers = data[0];
  const idCol = headers.indexOf("employeeId");
  if (idCol === -1) return false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === String(employeeId).trim()) {
      const emp = rowToEmployee(rowToObject<Record<string, string>>(headers, data[i]));
      await updateRow(SHEETS.DATA_NEWCOMER, i + 1, employeeToRow({ ...emp, status }));
      return true;
    }
  }
  return false;
}

export async function deleteEmployeeByEmployeeId(employeeId: string): Promise<boolean> {
  const rowIndex = await findRowIndex(SHEETS.DATA_NEWCOMER, "employeeId", employeeId);
  if (!rowIndex) return false;
  await deleteRow(SHEETS.DATA_NEWCOMER, rowIndex);
  return true;
}

// ---- Import from an external Google Sheet link (Admin2 > ฐานข้อมูลพนักงานใหม่) ----

// Turns a normal Google Sheets edit/view URL into its CSV export URL, e.g.
// https://docs.google.com/spreadsheets/d/<id>/edit?gid=123#gid=123
// -> https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=123
export function toCsvExportUrl(sheetUrl: string): string {
  const idMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    throw new Error("ลิงก์ Google Sheet ไม่ถูกต้อง");
  }
  const id = idMatch[1];
  const gidMatch = sheetUrl.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes
// ("") inside quotes, commas/newlines inside quotes, and \r\n line endings.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const NEWCOMER_SOURCE_HEADERS = ["ลำดับ", "บริษัท", "เดือน", "วันที่เริ่มงาน", "รายชื่อพนักงาน", "ตำแหน่ง", "หน่วยงาน"];

// Google Sheets sometimes wraps a cell's text (e.g. a long "หน่วยงาน" that the
// person hit Alt+Enter inside), which the CSV export then round-trips as a
// real newline embedded inside that one quoted field. Left alone, that
// newline still displays fine in a browser (it just collapses to a space),
// but if it survives into values we re-write to our own sheet things like
// leading/trailing spaces or repeated whitespace can make a field look
// "broken" when copy-pasted around. Normalize every imported text field so
// what's stored is always a single clean line.
function cleanField(val: unknown): string {
  return String(val ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ImportNewcomersResult {
  imported: number;
  // Optional source columns ("รหัสพนักงาน", "C Level") that were NOT found in
  // the pasted sheet/tab, and the headers that were found (for diagnosing a
  // wrong tab / renamed header).
  missingOptional: string[];
  headers: string[];
  csv: string; // the raw CSV as fetched, for the "Format ข้อมูลเป็น CSV" preview
}

// Fetches the linked Google Sheet, reformats it as CSV, and replaces the
// contents of our own "Data Newcomer" sheet with it — matching each row to
// an existing one (by company + fullName + startDate) so an already
// "ONBOARDED" (ได้รับของแล้ว) employee doesn't get reset to PENDING just
// because the admin re-pasted the link.
export async function importNewcomersFromSheet(sheetUrl: string): Promise<ImportNewcomersResult> {
  // NOTE (speed): we no longer call ensureSheetHeaders() here - it made ~8
  // sequential Sheets calls (one per tab). getEmployees() below already
  // creates a missing "Data Newcomer" tab, and we always write the header row.
  const csvUrl = toCsvExportUrl(sheetUrl);
  // Download the source CSV and read our current roster at the same time.
  const [res, existing] = await Promise.all([fetch(csvUrl), getEmployees(true)]);
  if (!res.ok) {
    throw new Error("ไม่สามารถดึงข้อมูลจากลิงก์ที่วางได้ ตรวจสอบว่าเปิดสิทธิ์ '‘ทุกคนที่มีลิงก์เข้าถึงได้'' แล้วหรือยัง");
  }
  // Strip a leading UTF-8 BOM: Google's CSV export always includes one, and
  // left in place it silently glues itself onto the very first header cell
  // (turning "ลำดับ" into "\uFEFFลำดับ"), which would still colIndex-match
  // fine here since we match by name on the *whole* header row — but keeping
  // it out avoids the same trap in any future header lookup.
  const csvRaw = await res.text();
  const csv = csvRaw.replace(/^\uFEFF/, "");
  const rows = parseCsv(csv);
  if (!rows.length) {
    throw new Error("ไม่พบข้อมูลใน Sheet ที่วางลิงก์มา");
  }

  const headerRow = rows[0].map((h) => h.trim());
  // Compare headers ignoring spaces / line breaks / zero-width chars / case, so
  // a wrapped header cell such as "C\nLevel" or "รหัส พนักงาน" still matches.
  const norm = (h: string) => h.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "").toLowerCase();
  const colIndex = (name: string) => headerRow.findIndex((h) => norm(h) === norm(name));
  const idx = {
    order: colIndex("ลำดับ"),
    company: colIndex("บริษัท"),
    month: colIndex("เดือน"),
    startDate: colIndex("วันที่เริ่มงาน"),
    fullName: colIndex("รายชื่อพนักงาน"),
    position: colIndex("ตำแหน่ง"),
    department: colIndex("หน่วยงาน"),
    // Optional: some source sheets add an employee-code column (e.g.
    // "รหัสพนักงาน"). When present we use it as the tracking employeeId
    // instead of auto-generating a "NEW-xxxxxxxx" one.
    employeeCode: colIndex("รหัสพนักงาน"),
    // Optional: "C Level" (also accepts "CLevel" / "C-Level").
    cLevel: headerRow.findIndex((h) => /^c-?level$/.test(norm(h))),
  };
  const missing = NEWCOMER_SOURCE_HEADERS.filter((h) => colIndex(h) === -1);
  if (missing.length) {
    throw new Error(`หัวคอลัมน์ใน Sheet ไม่ตรงตามที่กำหนด ขาด: ${missing.join(", ")}`);
  }

  const keyOf = (company: string, fullName: string, startDate: string) =>
    `${company.trim()}|${fullName.trim()}|${startDate.trim()}`;
  const existingByKey = new Map(existing.map((e) => [keyOf(e.company, e.fullName, e.startDate), e]));

  const now = new Date().toISOString();
  const nextRows: unknown[][] = [];
  // old employeeId -> new employeeId (when the source sheet supplies a real
  // รหัสพนักงาน for someone who previously had an auto-generated NEW-xxxx id)
  const idMigrations = new Map<string, string>();
  for (const r of rows.slice(1)) {
    const fullName = cleanField(r[idx.fullName]);
    if (!fullName) continue; // skip blank rows
    const company = cleanField(r[idx.company]);
    const startDate = cleanField(r[idx.startDate]);
    const employeeCode = idx.employeeCode !== -1 ? cleanField(r[idx.employeeCode]) : "";
    const prior = existingByKey.get(keyOf(company, fullName, startDate));
    const id = prior?.id || uuidv4();
    const employeeId = employeeCode || prior?.employeeId || `NEW-${id.slice(0, 8)}`;
    if (prior?.employeeId && prior.employeeId !== employeeId) {
      idMigrations.set(prior.employeeId, employeeId);
    }
    const emp: Employee = {
      id,
      employeeId,
      order: cleanField(r[idx.order]),
      company,
      month: cleanField(r[idx.month]),
      startDate,
      fullName,
      position: cleanField(r[idx.position]),
      department: cleanField(r[idx.department]),
      cLevel: idx.cLevel !== -1 ? cleanField(r[idx.cLevel]) : "",
      status: prior?.status || "PENDING",
      createdAt: prior?.createdAt || now,
    };
    nextRows.push(employeeToRow(emp));
  }

  const sheets = await getSheetsClient();
  // ONE write: header row (refreshed so older sheets gain "C Level") + all rows.
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.DATA_NEWCOMER}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [HEADERS["Data Newcomer"], ...nextRows] },
  });
  // Only when the roster got shorter: wipe the leftover old rows below it.
  if (existing.length > nextRows.length) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.DATA_NEWCOMER}!A${nextRows.length + 2}:Z100000`,
    });
  }

  invalidateSheetCaches(SHEETS.DATA_NEWCOMER);

  // Keep onboarding history attached to the person after their id changed.
  await migrateEmployeeIdsInLogs(idMigrations);

  const missingOptional: string[] = [];
  if (idx.employeeCode === -1) missingOptional.push("รหัสพนักงาน");
  if (idx.cLevel === -1) missingOptional.push("C Level");
  return {
    imported: nextRows.length,
    missingOptional,
    headers: headerRow.map((h) => h.replace(/\s+/g, " ")),
    csv,
  };
}

// Rewrites RequisitionLog.employeeId for rows whose id changed (see above),
// so the "สินค้าที่ได้รับ" / สถานะ columns keep working after re-importing.
async function migrateEmployeeIdsInLogs(map: Map<string, string>): Promise<void> {
  if (!map.size) return;
  const data = await getSheetData(SHEETS.REQUISITION_LOG);
  if (data.length < 2) return;
  const col = data[0].indexOf("employeeId");
  if (col === -1 || col > 25) return;
  let changed = false;
  const values = data.slice(1).map((r) => {
    const cur = r[col] ?? "";
    const next = map.get(cur);
    if (next !== undefined) {
      changed = true;
      return [next];
    }
    return [cur];
  });
  if (!changed) return;
  const letter = String.fromCharCode(65 + col);
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.REQUISITION_LOG}!${letter}2:${letter}${values.length + 1}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
  invalidateLogsCache();
}

// One row per employee who has had onboarding stock deducted for them,
// combining who did the withdrawal (ชื่อผู้เบิก, from RequisitionLog) with
// that employee's roster info (from "Data Newcomer"). A single onboarding
// claim usually writes several RequisitionLog rows (one per product), so
// rows are grouped by employeeId and reduced to the earliest claim.
export interface OnboardingHistoryEntry {
  employeeId: string;
  requestedBy: string; // ชื่อผู้เบิก
  claimedAt: string; // earliest RequisitionLog.createdAt for this employee
  company: string;
  month: string;
  startDate: string;
  fullName: string;
  position: string;
  department: string;
  status: EmployeeStatus;
}

export async function getOnboardingHistory(): Promise<OnboardingHistoryEntry[]> {
  const [logs, employees] = await Promise.all([
    getRequisitionLogs({ isOnboarding: true }),
    getEmployees(),
  ]);
  const employeeById = new Map(employees.map((e) => [e.employeeId, e]));

  const byEmployee = new Map<string, { requestedBy: string; claimedAt: string; employeeName: string }>();
  for (const log of logs) {
    if (log.status !== "SUCCESS" || !log.employeeId) continue;
    const cur = byEmployee.get(log.employeeId);
    if (!cur || log.createdAt < cur.claimedAt) {
      byEmployee.set(log.employeeId, {
        requestedBy: log.userName,
        claimedAt: log.createdAt,
        employeeName: log.employeeName,
      });
    }
  }

  const entries: OnboardingHistoryEntry[] = [];
  for (const [employeeId, info] of byEmployee) {
    const emp = employeeById.get(employeeId);
    entries.push({
      employeeId,
      requestedBy: info.requestedBy,
      claimedAt: info.claimedAt,
      company: emp?.company || "",
      month: emp?.month || "",
      startDate: emp?.startDate || "",
      fullName: emp?.fullName || info.employeeName,
      position: emp?.position || "",
      department: emp?.department || "",
      status: emp?.status || "ONBOARDED",
    });
  }
  return entries.sort((a, b) => (a.claimedAt < b.claimedAt ? 1 : -1));
}

// ============ Onboarding Bundles ============
export async function getOnboardingBundles(): Promise<OnboardingBundle[]> {
  const data = await getSheetDataCached(SHEETS.ONBOARDING_BUNDLES, SMALL_SHEET_TTL_MS);
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map((row) => {
    const raw = rowToObject<Record<string, string>>(headers, row);
    return {
      id: raw.id || "",
      bundleName: raw.bundleName || "",
      description: raw.description || "",
      isActive: parseBoolean(raw.isActive),
      createdAt: raw.createdAt || "",
    };
  });
}

async function getAllBundleItems(): Promise<OnboardingBundleItem[]> {
  const data = await getSheetDataCached(SHEETS.ONBOARDING_BUNDLE_ITEMS, SMALL_SHEET_TTL_MS);
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map((row) => {
    const raw = rowToObject<Record<string, string>>(headers, row);
    return {
      id: raw.id || "",
      bundleId: raw.bundleId || "",
      productId: raw.productId || "",
      productName: raw.productName || "",
      quantityPerSet: parseNumber(raw.quantityPerSet, 1),
    };
  });
}

// All active bundles + their items in ONE call (reads each sheet once).
export async function getBundlesWithItems(): Promise<
  { bundle: OnboardingBundle; items: OnboardingBundleItem[] }[]
> {
  const [bundles, items] = await Promise.all([getOnboardingBundles(), getAllBundleItems()]);
  return bundles
    .filter((b) => b.isActive)
    .map((bundle) => ({ bundle, items: items.filter((i) => i.bundleId === bundle.id) }));
}

export async function getBundleItems(bundleId: string): Promise<OnboardingBundleItem[]> {
  return (await getAllBundleItems()).filter((i) => i.bundleId === bundleId);
}

// Per-product "received?" status for newcomers, built ONLY from the
// onboarding (ชุดพนักงานใหม่) and activity (เบิกสำหรับกิจกรรม) RequisitionLog
// rows (one cached Sheets read). A product counts as received when the net
// withdrawn quantity (requested - returned) is > 0. Activity items are never
// returned, so they simply count as received once the withdrawal succeeded.
// - Only employees that have such rows appear in the result; the UI falls
//   back to the roster's own status for everybody else.
// - Onboarding: a person's expected products = only the items the admin
//   picked for them. The overall status (COMPLETE/PARTIAL/NONE) is computed
//   from onboarding items only - an activity withdrawal never makes someone
//   "ได้รับแล้ว" for the onboarding kit.
export async function getEmployeeItemStatuses(): Promise<EmployeeItemStatusResult> {
  const allLogs = await getRequisitionLogs();
  const logs = allLogs.filter((l) => l.isOnboarding || l.isActivity);
  const srcOf = (l: RequisitionLog): ItemSource => (l.isActivity ? "ACTIVITY" : "ONBOARDING");

  // columns = every product that was actually picked for someone
  const columns: { productId: string; productName: string }[] = [];
  const seen = new Set<string>();
  for (const l of logs) {
    if (!l.productId || seen.has(l.productId)) continue;
    seen.add(l.productId);
    columns.push({ productId: l.productId, productName: l.productName || l.productId });
  }

  type Acc = {
    // key = `${source}:${productId}`
    selected: Map<string, { productId: string; productName: string; source: ItemSource }>;
    net: Map<string, number>;
    lastOnb?: { by: string; at: string };
    lastAct?: { by: string; at: string };
  };
  const byEmp = new Map<string, Acc>();
  for (const l of logs) {
    if (!l.employeeId) continue;
    const src = srcOf(l);
    const key = `${src}:${l.productId}`;
    const acc: Acc = byEmp.get(l.employeeId) || { selected: new Map(), net: new Map() };
    byEmp.set(l.employeeId, acc);
    if (!acc.selected.has(key)) {
      acc.selected.set(key, { productId: l.productId, productName: l.productName || l.productId, source: src });
    }
    if (l.status !== "SUCCESS") continue;
    const slot = src === "ACTIVITY" ? "lastAct" : "lastOnb";
    const prev = acc[slot];
    if (!prev || l.createdAt > prev.at) acc[slot] = { by: l.userName, at: l.createdAt };
    acc.net.set(key, (acc.net.get(key) || 0) + (l.quantityRequested - l.returnedQuantity));
  }

  const result: EmployeeItemStatusResult["employees"] = {};
  for (const [employeeId, acc] of byEmp) {
    const items: Record<string, ItemReceiveState> = {};
    for (const c of columns) items[c.productId] = "NA";
    const selected: {
      productId: string;
      productName: string;
      received: boolean;
      source: ItemSource;
    }[] = [];
    let onbTotal = 0;
    let onbReceived = 0;
    // Onboarding items first (green), activity items after (orange).
    const ordered = [...acc.selected.entries()].sort(
      (a, b) => Number(a[1].source === "ACTIVITY") - Number(b[1].source === "ACTIVITY")
    );
    for (const [key, it] of ordered) {
      const received = (acc.net.get(key) || 0) > 0;
      if (it.source === "ONBOARDING") {
        onbTotal++;
        if (received) onbReceived++;
        items[it.productId] = received ? "RECEIVED" : "PENDING";
      }
      selected.push({ ...it, received });
    }
    const hasOnboarding = onbTotal > 0;
    const overall: OverallReceiveState = !hasOnboarding
      ? "NONE"
      : onbReceived === onbTotal
      ? "COMPLETE"
      : onbReceived > 0
      ? "PARTIAL"
      : "NONE";
    const last = acc.lastOnb || acc.lastAct;
    result[employeeId] = {
      items,
      selected,
      hasOnboarding,
      overall,
      requestedBy: last?.by,
      requestedAt: last?.at,
    };
  }
  return { columns, employees: result };
}

// ============ Event categories (Config sheet) ============
// The "Event" dropdown on the general requisition form is fed from a Google
// Sheet called "Config": the column whose header is "Event" lists the
// categories. The sheet can live in its own spreadsheet (default id below,
// override with CONFIG_SPREADSHEET_ID) - share it with the service account
// (Viewer is enough). If that spreadsheet cannot be read we fall back to a
// "Config" tab inside the main GOOGLE_SHEETS_ID spreadsheet.
const CONFIG_SPREADSHEET_ID =
  process.env.CONFIG_SPREADSHEET_ID || "1q3HTJFP2h3mjJ5Lf7Xdhh9rMC7vkMfYwrWZhBU21Ojk";
const CONFIG_SHEET_NAME = process.env.CONFIG_SHEET_NAME || "Config";
const CONFIG_EVENT_HEADER = process.env.CONFIG_EVENT_HEADER || "Event";
const EVENT_CATEGORIES_TTL_MS = 60_000;

let eventCategoriesCache: { data: string[]; ts: number } | null = null;

async function readEventColumn(spreadsheetId: string): Promise<string[]> {
  const sheets = await getSheetsClient();
  // Find the right tab: the one called Config (case-insensitive), else the first tab.
  const meta = await withRetry(() =>
    sheets.spreadsheets.get(
      { spreadsheetId, fields: "sheets.properties.title" },
      { timeout: READ_TIMEOUT_MS }
    )
  );
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title || "").filter(Boolean);
  const tab =
    titles.find((t) => t.trim().toLowerCase() === CONFIG_SHEET_NAME.toLowerCase()) || titles[0];
  if (!tab) return [];

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get(
      { spreadsheetId, range: `'${tab.replace(/'/g, "''")}'` },
      { timeout: READ_TIMEOUT_MS }
    )
  );
  const rows = (res.data.values as string[][]) || [];
  const norm = (v: unknown) => String(v ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "").toLowerCase();
  const want = norm(CONFIG_EVENT_HEADER);

  // Header = the first cell equal to "Event" within the first few rows.
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const c = (rows[r] || []).findIndex((h) => norm(h) === want);
    if (c === -1) continue;
    const seenVals = new Set<string>();
    const out: string[] = [];
    for (let i = r + 1; i < rows.length; i++) {
      const v = cleanField(rows[i]?.[c]);
      if (!v || seenVals.has(v.toLowerCase())) continue;
      seenVals.add(v.toLowerCase());
      out.push(v);
    }
    return out;
  }
  return [];
}

export async function getEventCategories(forceRefresh = false): Promise<string[]> {
  if (!forceRefresh && eventCategoriesCache && Date.now() - eventCategoriesCache.ts < EVENT_CATEGORIES_TTL_MS) {
    return eventCategoriesCache.data;
  }
  const candidates = [CONFIG_SPREADSHEET_ID, SPREADSHEET_ID].filter(
    (id, i, arr) => !!id && arr.indexOf(id) === i
  );
  let lastErr: unknown;
  for (const id of candidates) {
    try {
      const list = await readEventColumn(id);
      if (list.length) {
        eventCategoriesCache = { data: list, ts: Date.now() };
        return list;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  // Keep serving the last good copy if Google hiccups.
  if (eventCategoriesCache) return eventCategoriesCache.data;
  if (lastErr) throw lastErr;
  return [];
}

export async function createBundle(bundle: Omit<OnboardingBundle, "id" | "createdAt">): Promise<OnboardingBundle> {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  await appendRows(SHEETS.ONBOARDING_BUNDLES, [
    [id, bundle.bundleName, bundle.description, bundle.isActive ? "TRUE" : "FALSE", createdAt],
  ]);
  invalidateBundlesCache();
  return { ...bundle, id, createdAt };
}

export async function createBundleItem(item: Omit<OnboardingBundleItem, "id">): Promise<OnboardingBundleItem> {
  const id = uuidv4();
  await appendRows(SHEETS.ONBOARDING_BUNDLE_ITEMS, [
    [id, item.bundleId, item.productId, item.productName, item.quantityPerSet],
  ]);
  invalidateBundlesCache();
  return { ...item, id };
}

export async function updateBundleItem(
  id: string,
  updates: Partial<Pick<OnboardingBundleItem, "productId" | "productName" | "quantityPerSet">>
): Promise<OnboardingBundleItem | null> {
  const data = await getSheetData(SHEETS.ONBOARDING_BUNDLE_ITEMS);
  if (data.length < 2) return null;
  const headers = data[0];
  const idIdx = headers.indexOf("id");
  let rowIndex = -1;
  let current: OnboardingBundleItem | null = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === id) {
      rowIndex = i + 1;
      const raw = rowToObject<Record<string, string>>(headers, data[i]);
      current = {
        id: raw.id || "",
        bundleId: raw.bundleId || "",
        productId: raw.productId || "",
        productName: raw.productName || "",
        quantityPerSet: parseNumber(raw.quantityPerSet, 1),
      };
      break;
    }
  }
  if (!current || rowIndex === -1) return null;
  const merged: OnboardingBundleItem = { ...current, ...updates };
  await updateRow(SHEETS.ONBOARDING_BUNDLE_ITEMS, rowIndex, [
    merged.id,
    merged.bundleId,
    merged.productId,
    merged.productName,
    merged.quantityPerSet,
  ]);
  invalidateBundlesCache();
  return merged;
}

export async function deleteBundleItem(id: string): Promise<boolean> {
  const data = await getSheetData(SHEETS.ONBOARDING_BUNDLE_ITEMS);
  if (data.length < 2) return false;
  const headers = data[0];
  const idIdx = headers.indexOf("id");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === id) {
      await deleteRow(SHEETS.ONBOARDING_BUNDLE_ITEMS, i + 1);
      invalidateBundlesCache();
      return true;
    }
  }
  return false;
}

// ============ Audit Log ============
export async function appendAuditLog(entry: Omit<AuditLog, "id" | "createdAt">): Promise<void> {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  await appendRows(SHEETS.AUDIT_LOG, [
    [id, entry.actorId, entry.actorName, entry.action, entry.targetUserId, entry.detail, createdAt],
  ]);
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const data = await getSheetDataCached(SHEETS.AUDIT_LOG, SMALL_SHEET_TTL_MS);
  if (data.length < 2) return [];
  const headers = data[0];
  return data
    .slice(1)
    .map((row) => {
      const raw = rowToObject<Record<string, string>>(headers, row);
      return {
        id: raw.id || "",
        actorId: raw.actorId || "",
        actorName: raw.actorName || "",
        action: raw.action || "",
        targetUserId: raw.targetUserId || "",
        detail: raw.detail || "",
        createdAt: raw.createdAt || "",
      };
    })
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

// Return history entries are derived from AuditLog "RETURN_ITEM" rows,
// since RequisitionLog only keeps a running total (returnedQuantity), not
// one row per return event. The detail text is written in a fixed format
// by returnStockItem() below, so it's safe to parse back out here.
export interface ReturnHistoryEntry {
  id: string;
  createdAt: string;
  returnedBy: string; // who clicked "return" (staff themselves, or an admin on their behalf)
  productName: string;
  quantity: number;
  unit: string;
  originalUserName: string; // who originally withdrew the item
  originalCreatedAt: string;
  targetUserId: string;
}

export async function getReturnHistory(filter?: { userId?: string }): Promise<ReturnHistoryEntry[]> {
  const logs = await getAuditLogs();
  const detailPattern = /^คืน (.+) จำนวน (\d+(?:\.\d+)?) (.+) \(เบิกโดย (.+) เมื่อ (.+)\)$/;

  return logs
    .filter((l) => l.action === "RETURN_ITEM")
    .filter((l) => !filter?.userId || l.targetUserId === filter.userId)
    .map((l) => {
      const m = l.detail.match(detailPattern);
      return {
        id: l.id,
        createdAt: l.createdAt,
        returnedBy: l.actorName,
        productName: m?.[1] || l.detail,
        quantity: m ? Number(m[2]) : 0,
        unit: m?.[3] || "",
        originalUserName: m?.[4] || "",
        originalCreatedAt: m?.[5] || "",
        targetUserId: l.targetUserId,
      };
    });
}

// ============ Cloudinary Image Upload ============
export async function uploadProductImage(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary config: ตั้งค่า CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET ใน .env"
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "stock-requisition-products";

  // Cloudinary signed upload: sign every param except file/api_key/resource_type, sorted alphabetically
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const crypto = await import("crypto");
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign + apiSecret)
    .digest("hex");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Cloudinary upload failed: ${data?.error?.message || res.statusText}`);
  }
  return data.secure_url as string;
}

// ============ Init / Ensure Headers ============
export async function ensureSheetHeaders(): Promise<void> {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTitles = new Set((meta.data.sheets || []).map((s) => s.properties?.title));

  for (const [sheetName, headers] of Object.entries(HEADERS)) {
    try {
      if (!existingTitles.has(sheetName)) {
        // Tab (e.g. "Data Newcomer") doesn't exist yet in this spreadsheet — create it.
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
        });
      }
      const data = await getSheetData(sheetName, "A1:Z1");
      if (!data.length || data[0].length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [headers] },
        });
      }
    } catch (e) {
      console.error(`Failed to ensure headers for ${sheetName}`, e);
    }
  }
  invalidateSheetCaches();
}