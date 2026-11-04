import Papa from "papaparse";
import { parseXlsxSandboxed } from "./xlsxSandbox";
import { EXPENSE_CATEGORIES } from "./finance";
import {
  gridToObjects,
  normaliseDate,
  normHeader,
  pdfLines,
  pdfLinesToGrid,
  type Grid,
  type PdfText,
} from "./sheetRows";
import { isCasText, parseCasLines } from "./casStatement";

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
  /** "NSE" / "BSE" when the export says — the ticker becomes "NSE:ITC". */
  exchange?: string;
  /** A fund's ISIN starts "INF", a share's "INE": how a fund is told apart. */
  isin?: string;
  /** Last / previous-close price or NAV, when the export carries one. */
  ltp?: number;
  /** The purchases this row stands for, oldest first, when the source lists them (a CAS). */
  lots?: { date: string; qty: number; cost: number }[];
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

// Column names as normHeader() writes them (lower case, "_" and "." as
// spaces), from generic exports and the brokers' own: a Zerodha tradebook
// ("Symbol, Trade Date, Trade Type, Quantity, Price") and holdings export
// ("Symbol, Quantity Available, Average Price"), Groww, Upstox, INDmoney.
const HEADER_MAP: Record<
  string,
  keyof Omit<ImportedRow, "id" | "currency" | "rate" | "broker">
> = {
  date: "date",
  "booking date": "date",
  "trade date": "date",
  "txn date": "date",
  "transaction date": "date",
  "order date": "date",
  "execution date": "date",
  symbol: "asset",
  ticker: "asset",
  asset: "asset",
  scrip: "asset",
  "scrip name": "asset",
  "trading symbol": "asset",
  tradingsymbol: "asset",
  instrument: "asset",
  "stock name": "asset",
  "company name": "asset",
  "scheme name": "asset",
  type: "action",
  action: "action",
  side: "action",
  "trade type": "action",
  "transaction type": "action",
  "buy/sell": "action",
  "buy sell": "action",
  quantity: "quantity",
  qty: "quantity",
  shares: "quantity",
  units: "quantity",
  "quantity available": "quantity",
  "available quantity": "quantity",
  "trade quantity": "quantity",
  price: "price",
  rate: "price",
  "avg price": "price",
  "average price": "price",
  "trade price": "price",
  "buy price": "price",
  "avg cost": "price",
  exchange: "exchange",
  isin: "isin",
  ltp: "ltp",
  "last price": "ltp",
  "current price": "ltp",
  "closing price": "ltp",
  "close price": "ltp",
  "previous closing price": "ltp",
  nav: "ltp",
  "current nav": "ltp",
};

/** Header names that mark a row as the asset table's header. */
const ASSET_HEADERS: ReadonlySet<string> = new Set(Object.keys(HEADER_MAP));

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

export const toRow = (raw: Record<string, unknown>, fallbackCcy = "INR"): ImportedRow | null => {
  const norm: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    const key = HEADER_MAP[normHeader(k)];
    // The first filled column wins ("Price" before a later "Avg Cost").
    if (key && String(norm[key] ?? "").trim() === "") norm[key] = raw[k];
  }
  const asset = String(norm.asset ?? "").trim();
  const quantity = Number(String(norm.quantity ?? "0").replace(/[^\d.-]/g, "")) || 0;
  const priceStr = String(norm.price ?? "0");
  const price = Number(priceStr.replace(/[^\d.-]/g, "")) || 0;
  // A trade or a holding names what and how much. Anything else under the
  // header — a "Total" line, a page footer, a disclaimer — is not a row.
  if (!asset || (quantity === 0 && price === 0)) return null;
  const currency = detectCurrency(priceStr) !== "INR" ? detectCurrency(priceStr) : fallbackCcy;
  const exchange = String(norm.exchange ?? "").trim().toUpperCase();
  const isin = String(norm.isin ?? "").trim().toUpperCase();
  const ltp = Number(String(norm.ltp ?? "").replace(/[^\d.-]/g, "")) || 0;
  return {
    id: crypto.randomUUID(),
    date: normaliseDate(norm.date) || String(norm.date ?? "").trim(),
    asset,
    action: normalizeAction(norm.action),
    quantity,
    price,
    currency,
    rate: FX[currency] ?? 1,
    ...(exchange ? { exchange } : {}),
    ...(isin ? { isin } : {}),
    ...(ltp > 0 ? { ltp } : {}),
  };
};

/** A CSV as a plain grid; the header row is found afterwards, not assumed. */
function csvGrid(file: File): Promise<Grid> {
  return new Promise((resolve, reject) => {
    Papa.parse<unknown[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });
}

const toRows = (objs: Record<string, unknown>[]) =>
  objs.map((r) => toRow(r)).filter((r): r is ImportedRow => !!r);

export async function parseCSV(file: File): Promise<ImportedRow[]> {
  return toRows(gridToObjects(await csvGrid(file), ASSET_HEADERS));
}

export async function parseExcel(file: File): Promise<ImportedRow[]> {
  const buf = await file.arrayBuffer();
  return toRows(await parseXlsxSandboxed(buf, ASSET_HEADERS));
}

/**
 * The PDF is locked. A CAS always is — with the password chosen when it was
 * requested (or the PAN, for some). [wrong] says one was given and refused.
 */
export class PdfPasswordError extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? "Incorrect PDF password" : "PDF needs a password");
    this.name = "PdfPasswordError";
  }
}

export type ParseOptions = { password?: string };

export async function parsePDF(file: File, opts: ParseOptions = {}): Promise<ImportedRow[]> {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib
    .getDocument({ data: buf, ...(opts.password ? { password: opts.password } : {}) })
    .promise.catch((err: unknown) => {
      if ((err as { name?: string })?.name === "PasswordException") {
        throw new PdfPasswordError(Boolean(opts.password));
      }
      throw err;
    });
  let text = "";
  const lines: ReturnType<typeof pdfLines> = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    // Lines are built per page: two pages share y coordinates.
    const items: PdfText[] = content.items.flatMap((it) =>
      "str" in it
        ? [{ text: it.str, x: it.transform[4], y: it.transform[5], width: it.width }]
        : [],
    );
    lines.push(...pdfLines(items));
  }
  // A mutual-fund CAS (CAMS / KFintech): one holding per fund.
  const lineText = lines.map((l) => l.map((c) => c.text).join(" "));
  if (isCasText(lineText.join("\n"))) return parseCasLines(lineText);

  // A real table first: the header row found by its column names, every
  // cell placed under the header column it sits beneath.
  const table = toRows(gridToObjects(pdfLinesToGrid(lines, ASSET_HEADERS), ASSET_HEADERS));
  if (table.length) return table;

  // Else a statement written as running text — DATE  SYMBOL  BUY/SELL  QTY  PRICE
  const re =
    /(\d{1,2}[-/](?:\d{1,2}|[A-Za-z]{3})[-/]\d{2,4}|\d{4}-\d{2}-\d{2})\s+([A-Z][A-Z0-9&.-]{1,15})\s+(BUY|SELL|B|S|BOUGHT|SOLD)\s+(\d+(?:\.\d+)?)\s+([₹$€£]?\s?\d+(?:,\d{3})*(?:\.\d+)?)/gi;
  const rows: ImportedRow[] = [];
  for (const m of text.matchAll(re)) {
    const priceStr = m[5];
    const currency = detectCurrency(priceStr);
    rows.push({
      id: crypto.randomUUID(),
      date: normaliseDate(m[1]) || m[1],
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

export async function parseFile(file: File, opts: ParseOptions = {}): Promise<ImportedRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const broker = detectBrokerFromFilename(file.name);
  let rows: ImportedRow[];
  if (ext === "csv") rows = await parseCSV(file);
  else if (ext === "xls" || ext === "xlsx") rows = await parseExcel(file);
  else if (ext === "pdf") rows = await parsePDF(file, opts);
  else throw new Error(`Unsupported file type: .${ext}`);
  if (broker) rows = rows.map((r) => ({ ...r, broker }));
  return rows;
}

export const SUPPORTED_EXT = [".csv", ".xls", ".xlsx", ".pdf"];
export const STRUCTURED_EXT = [".csv", ".xls", ".xlsx"];

// ── Generic flat-row parser (CSV / XLSX → plain objects) ──────────────────
async function parseToObjects(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  // The header is the first row with two or more filled cells, so a title
  // line or a blank row above the table no longer hides it.
  if (ext === "csv") return gridToObjects(await csvGrid(file));
  const buf = await file.arrayBuffer();
  return parseXlsxSandboxed(buf);
}

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;

// ── Expense category names ────────────────────────────────────────────────
// A spreadsheet says "Food" or "Health"; the app's categories are "Food & Dining" and "Healthcare".
// Imported verbatim, those rows never matched the chips, the charts or a budget. Our own template
// even used "Food". Only an exact (case-insensitive) match or one of these obvious aliases is
// changed; any other name is kept as written so the user can still edit it in the preview.
const EXPENSE_CATEGORY_ALIASES: Record<string, (typeof EXPENSE_CATEGORIES)[number]> = {
  food: "Food & Dining",
  dining: "Food & Dining",
  "food and dining": "Food & Dining",
  health: "Healthcare",
  medical: "Healthcare",
  "health care": "Healthcare",
  transportation: "Transport",
  "personal care": "Personal Care",
  subscription: "Subscriptions",
  utility: "Utilities",
};

export function canonicalExpenseCategory(raw: string): string {
  const key = raw.trim().toLowerCase();
  const exact = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === key);
  return exact ?? EXPENSE_CATEGORY_ALIASES[key] ?? raw;
}

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
        category: canonicalExpenseCategory(str(r["category"] ?? r["Category"] ?? r["CATEGORY"] ?? "Uncategorized")),
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