import * as XLSX from "xlsx";
import Papa from "papaparse";
import * as pdfjsLib from "pdfjs-dist";
// @ts-expect-error - vite worker import
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

export type ImportedRow = {
  id: string;
  date: string;
  asset: string;
  action: "Inflow" | "Outflow";
  quantity: number;
  price: number;
  currency: string;
  rate: number; // FX to INR
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
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return json.map((r) => toRow(r)).filter((r): r is ImportedRow => !!r);
}

export async function parsePDF(file: File): Promise<ImportedRow[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: { str?: string }) => it.str ?? "").join(" ") + "\n";
  }
  // Regex: DATE  SYMBOL  BUY/SELL  QTY  PRICE
  const re =
    /(\d{1,2}[-/](?:\d{1,2}|[A-Za-z]{3})[-/]\d{2,4}|\d{4}-\d{2}-\d{2})\s+([A-Z][A-Z0-9&.\-]{1,15})\s+(BUY|SELL|B|S|BOUGHT|SOLD)\s+(\d+(?:\.\d+)?)\s+([₹$€£]?\s?\d+(?:,\d{3})*(?:\.\d+)?)/gi;
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
  if (ext === "csv") return parseCSV(file);
  if (ext === "xls" || ext === "xlsx") return parseExcel(file);
  if (ext === "pdf") return parsePDF(file);
  throw new Error(`Unsupported file type: .${ext}`);
}

export const SUPPORTED_EXT = [".csv", ".xls", ".xlsx", ".pdf"];