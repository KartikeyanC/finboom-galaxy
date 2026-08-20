import Papa from "papaparse";
import { parseXlsxSandboxed } from "./xlsxSandbox";

// pdfjs is heavy (~1MB) and only needed for PDF statements, so it is lazily
// imported inside parsePDF rather than eagerly at module load. This keeps it
// out of the main bundle for the common CSV/XLSX path.
async function loadPdfjs() {
  const [pdfjsLib, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjsLib;
}

export type ImportedRow = {
  id: string;
  date: string;
  asset: string;
  action: "Inflow" | "Outflow";
  quantity: number;
  price: number;
  currency: string;
  rate: number; // FX to INR
  broker?: string;
};

export type ExpenseRow = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
};

export type IncomeRow = {
  id: string;
  name: string;
  type: "active" | "passive";
  amount: number;
  currency: string;
  frequency: "monthly" | "weekly" | "one-time";
  notes: string;
};

export type GoalRow = {
  id: string;
  title: string;
  category: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date: string;
  status: string;
};

export type BudgetRow = {
  id: string;
  bucket: string;
  allocated: number;
  spent: number;
  period: string;
  period_start: string;
};

const HEADER_MAP: Record<string, keyof Omit<ImportedRow, "id" | "currency" | "rate">> = {
  date: "date",
  "booking date": "date",
  "trade date": "date",
  "txn date": "date",
  symbol: "asset",
  ticker: "asset",
  asset: "asset",
  scrip: "asset",
  type: "action",
  action: "action",
  side: "action",
  quantity: "quantity",
  qty: "quantity",
  shares: "quantity",
  units: "quantity",
  price: "price",
  rate: "price",
  "avg price": "price",
};

const FX: Record<string, number> = { INR: 1, USD: 83.5, EUR: 90, GBP: 105, AED: 22.7 };

export const detectBrokerFromFilename = (name: string): string | undefined => {
  const n = name.toLowerCase();
  if (n.includes("zerodha") || n.includes("kite")) return "Zerodha";
  if (n.includes("groww")) return "Groww";
  if (n.includes("indmoney") || n.includes("ind money")) return "INDmoney";
  if (n.includes("angel")) return "Angel One";
  if (n.includes("upstox")) return "Upstox";
  if (n.includes("kuvera")) return "Kuvera";
  if (n.includes("coinswitch")) return "CoinSwitch";
  if (n.includes("binance")) return "Binance";
  if (n.includes("wazirx")) return "WazirX";
  return undefined;
};

const detectCurrency = (s: string): string => {
  if (/\$|USD/i.test(s)) return "USD";
  if (/€|EUR/i.test(s)) return "EUR";
  if (/£|GBP/i.test(s)) return "GBP";
  if (/AED|د\.إ/i.test(s)) return "AED";
  return "INR";
};

const normalizeAction = (v: unknown): "Inflow" | "Outflow" => {
  const s = String(v ?? "").toLowerCase();
  if (/sell|debit|out|withdraw/.test(s)) return "Outflow";
  return "Inflow";
};

const toRow = (raw: Record<string, unknown>, fallbackCcy = "INR"): ImportedRow | null => {
  const norm: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    const key = HEADER_MAP[k.trim().toLowerCase()];
    if (key) norm[key] = raw[k];
  }
  if (!norm.date && !norm.asset) return null;
  const priceStr = String(norm.price ?? "0");
  const currency = detectCurrency(priceStr) !== "INR" ? detectCurrency(priceStr) : fallbackCcy;
  return {
    id: crypto.randomUUID(),
    date: String(norm.date ?? ""),
    asset: String(norm.asset ?? "—"),
    action: normalizeAction(norm.action),
    quantity: Number(String(norm.quantity ?? "0").replace(/[^\d.-]/g, "")) || 0,
    price: Number(priceStr.replace(/[^\d.-]/g, "")) || 0,
    currency,
    rate: FX[currency] ?? 1,
  };
};

export async function parseCSV(file: File): Promise<ImportedRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) =>
        resolve(res.data.map((r) => toRow(r)).filter((r): r is ImportedRow => !!r)),
      error: reject,
    });
  });
}

export async function parseExcel(file: File): Promise<ImportedRow[]> {
  const buf = await file.arrayBuffer();
  const json = await parseXlsxSandboxed(buf);
  return json.map((r) => toRow(r)).filter((r): r is ImportedRow => !!r);
}

export async function parsePDF(file: File): Promise<ImportedRow[]> {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  // Regex: DATE  SYMBOL  BUY/SELL  QTY  PRICE
  const re =
    /(\d{1,2}[-/](?:\d{1,2}|[A-Za-z]{3})[-/]\d{2,4}|\d{4}-\d{2}-\d{2})\s+([A-Z][A-Z0-9&.-]{1,15})\s+(BUY|SELL|B|S|BOUGHT|SOLD)\s+(\d+(?:\.\d+)?)\s+([₹$€£]?\s?\d+(?:,\d{3})*(?:\.\d+)?)/gi;
  const rows: ImportedRow[] = [];
  for (const m of text.matchAll(re)) {
    const priceStr = m[5];
    const currency = detectCurrency(priceStr);
    rows.push({
      id: crypto.randomUUID(),
      date: m[1],
      asset: m[2],
      action: /S/i.test(m[3][0]) && !/B/i.test(m[3][0]) ? "Outflow" : normalizeAction(m[3]),
      quantity: Number(m[4]) || 0,
      price: Number(priceStr.replace(/[^\d.-]/g, "")) || 0,
      currency,
      rate: FX[currency] ?? 1,
    });
  }
  return rows;
}

export async function parseFile(file: File): Promise<ImportedRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const broker = detectBrokerFromFilename(file.name);
  let rows: ImportedRow[];
  if (ext === "csv") rows = await parseCSV(file);
  else if (ext === "xls" || ext === "xlsx") rows = await parseExcel(file);
  else if (ext === "pdf") rows = await parsePDF(file);
  else throw new Error(`Unsupported file type: .${ext}`);
  if (broker) rows = rows.map((r) => ({ ...r, broker }));
  return rows;
}

export const SUPPORTED_EXT = [".csv", ".xls", ".xlsx", ".pdf"];
export const STRUCTURED_EXT = [".csv", ".xls", ".xlsx"];

// ── Generic flat-row parser (CSV / XLSX → plain objects) ──────────────────
async function parseToObjects(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => resolve(r.data),
        error: reject,
      });
    });
  }
  const buf = await file.arrayBuffer();
  return parseXlsxSandboxed(buf);
}

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;

// ── Expense parser ────────────────────────────────────────────────────────
/**
 * BUG-108 — a row with neither a date nor an amount used to be dropped with
 * no trace: the valid rows still imported fine, but nothing told the user a
 * row went missing, or that it was source data rather than never existing.
 * `skipped` lets the caller say so.
 */
export async function parseExpenses(file: File): Promise<{ rows: ExpenseRow[]; skipped: number }> {
  const raw = await parseToObjects(file);
  const rows = raw
    .map((r): ExpenseRow | null => {
      const date = str(r["date"] ?? r["Date"] ?? r["DATE"] ?? "");
      const amount = num(r["amount"] ?? r["Amount"] ?? r["AMOUNT"] ?? 0);
      if (!date && !amount) return null;
      return {
        id: crypto.randomUUID(),
        date,
        category: str(r["category"] ?? r["Category"] ?? r["CATEGORY"] ?? "Uncategorized"),
        description: str(r["description"] ?? r["Description"] ?? r["note"] ?? r["Note"] ?? ""),
        amount,
        currency: str(r["currency"] ?? r["Currency"] ?? "INR") || "INR",
      };
    })
    .filter((r): r is ExpenseRow => !!r);
  return { rows, skipped: raw.length - rows.length };
}

// ── Income parser ─────────────────────────────────────────────────────────
const normalizeFrequency = (v: unknown): "monthly" | "weekly" | "one-time" => {
  const s = str(v).toLowerCase();
  if (s.includes("week")) return "weekly";
  if (s.includes("one") || s.includes("single") || s.includes("lump")) return "one-time";
  return "monthly";
};

export async function parseIncomeRows(file: File): Promise<IncomeRow[]> {
  const rows = await parseToObjects(file);
  return rows
    .map((r): IncomeRow | null => {
      const name = str(r["name"] ?? r["Name"] ?? r["source"] ?? r["Source"] ?? "");
      if (!name) return null;
      return {
        id: crypto.randomUUID(),
        name,
        type: (str(r["type"] ?? r["Type"] ?? "active").toLowerCase() === "passive"
          ? "passive"
          : "active") as "active" | "passive",
        amount: num(r["amount"] ?? r["Amount"] ?? 0),
        currency: str(r["currency"] ?? r["Currency"] ?? "INR") || "INR",
        frequency: normalizeFrequency(r["frequency"] ?? r["Frequency"] ?? "monthly"),
        notes: str(r["notes"] ?? r["Notes"] ?? r["note"] ?? r["Note"] ?? ""),
      };
    })
    .filter((r): r is IncomeRow => !!r);
}

// ── Goal parser ───────────────────────────────────────────────────────────
export async function parseGoals(file: File): Promise<GoalRow[]> {
  const rows = await parseToObjects(file);
  return rows
    .map((r): GoalRow | null => {
      const title = str(r["title"] ?? r["Title"] ?? r["name"] ?? r["Name"] ?? "");
      if (!title) return null;
      return {
        id: crypto.randomUUID(),
        title,
        category: str(r["category"] ?? r["Category"] ?? ""),
        target_amount: num(r["target_amount"] ?? r["Target Amount"] ?? r["target"] ?? 0),
        current_amount: num(r["current_amount"] ?? r["Current Amount"] ?? r["current"] ?? 0),
        currency: str(r["currency"] ?? r["Currency"] ?? "INR") || "INR",
        target_date: str(r["target_date"] ?? r["Target Date"] ?? r["due_date"] ?? ""),
        status: str(r["status"] ?? r["Status"] ?? "active") || "active",
      };
    })
    .filter((r): r is GoalRow => !!r);
}

// ── Budget parser ─────────────────────────────────────────────────────────
export async function parseBudgets(file: File): Promise<BudgetRow[]> {
  const rows = await parseToObjects(file);
  return rows
    .map((r): BudgetRow | null => {
      const bucket = str(r["bucket"] ?? r["Bucket"] ?? r["category"] ?? r["Category"] ?? "");
      if (!bucket) return null;
      return {
        id: crypto.randomUUID(),
        bucket,
        allocated: num(r["allocated"] ?? r["Allocated"] ?? r["budget"] ?? r["Budget"] ?? 0),
        spent: num(r["spent"] ?? r["Spent"] ?? 0),
        period: str(r["period"] ?? r["Period"] ?? "monthly") || "monthly",
        period_start: str(r["period_start"] ?? r["Period Start"] ?? r["start_date"] ?? ""),
      };
    })
    .filter((r): r is BudgetRow => !!r);
}

// ── CSV template generators ───────────────────────────────────────────────
function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadExpenseTemplate = () =>
  downloadCSV("finroot_expenses_template.csv", [
    ["date", "category", "description", "amount", "currency"],
    ["2024-01-15", "Food", "Lunch at café", "250", "INR"],
    ["2024-01-20", "Transport", "Uber ride", "180", "INR"],
  ]);

export const downloadIncomeTemplate = () =>
  downloadCSV("finroot_income_template.csv", [
    ["name", "type", "amount", "currency", "frequency", "notes"],
    ["Salary", "active", "80000", "INR", "monthly", "Primary job"],
    ["Freelance", "active", "20000", "INR", "monthly", ""],
    ["Dividends", "passive", "5000", "INR", "monthly", "Stock dividends"],
  ]);

export const downloadGoalsTemplate = () =>
  downloadCSV("finroot_goals_template.csv", [
    ["title", "category", "target_amount", "current_amount", "currency", "target_date", "status"],
    ["Emergency Fund", "Savings", "300000", "50000", "INR", "2025-12-31", "active"],
    ["New Car", "Vehicle", "800000", "100000", "INR", "2026-06-30", "active"],
  ]);

export const downloadBudgetsTemplate = () =>
  downloadCSV("finroot_budgets_template.csv", [
    ["bucket", "allocated", "spent", "period", "period_start"],
    ["Food & Dining", "15000", "0", "monthly", "2024-01-01"],
    ["Transport", "5000", "0", "monthly", "2024-01-01"],
    ["Entertainment", "3000", "0", "monthly", "2024-01-01"],
  ]);