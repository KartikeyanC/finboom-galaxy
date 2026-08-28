import { HandCoins, Landmark, Target, TrendingUp, Wallet } from "lucide-react";

/**
 * Export page configuration and pure helpers — split out of Export.tsx in
 * Stage 4.13.
 *
 * The real reason for this file is the bottom half: `calcRange`, `withinRange`
 * and `makeCSV` decide which rows land in a downloaded statement and how they
 * are quoted, and inside a 730-line page nothing could reach them. They are
 * pure, so they are now tested (see reportData.test.ts). `dlBlob` stays with
 * them because it is the other half of the same act, but it touches the DOM
 * and is deliberately kept to four lines that do nothing but hand the browser
 * a blob.
 */

export const PIE_COLORS = [
  "#6366f1","#22c55e","#f59e0b","#ec4899",
  "#14b8a6","#8b5cf6","#f97316","#0ea5e9",
  "#a855f7","#ef4444",
];

// ── sections config ───────────────────────────────────────────────────────────
export const SECTIONS = [
  { id: "expenses",    label: "Expenses",    icon: HandCoins,    color: "text-rose-500",    bg: "bg-rose-500/10"    },
  { id: "income",      label: "Income",      icon: Wallet,       color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { id: "investments", label: "Investments", icon: TrendingUp,   color: "text-indigo-500",  bg: "bg-indigo-500/10"  },
  { id: "budget",      label: "Budget",      icon: Target,       color: "text-amber-500",   bg: "bg-amber-500/10"   },
  { id: "accounts",    label: "Accounts",    icon: Landmark,     color: "text-sky-500",     bg: "bg-sky-500/10"     },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

// ── date presets ──────────────────────────────────────────────────────────────
export const DATE_PRESETS = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_3m",    label: "3 Months"   },
  { value: "this_year",  label: "This Year"  },
  { value: "all",        label: "All Time"   },
  { value: "custom",     label: "Custom"     },
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

// ── helpers ───────────────────────────────────────────────────────────────────
const STRIP_RE = /^\[[^\]|]+\|[^\]]+\]\s*/;
export const clean = (s: string | null | undefined) => (s ?? "").replace(STRIP_RE, "");
export const rupee = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function calcRange(preset: DatePreset, from: string, to: string) {
  const now = new Date();
  if (preset === "custom")     return { from: from ? new Date(from) : null, to: to ? new Date(to) : null };
  if (preset === "this_month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (preset === "last_month") return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to:   new Date(now.getFullYear(), now.getMonth(), 0),
  };
  if (preset === "last_3m")   return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: now };
  if (preset === "this_year") return { from: new Date(now.getFullYear(), 0, 1), to: now };
  return { from: null, to: null };
}

export function withinRange(date: Date, r: { from: Date | null; to: Date | null }) {
  if (r.from && date < r.from) return false;
  if (r.to   && date > r.to)   return false;
  return true;
}

export function makeCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [keys.join(","), ...rows.map((r) =>
    keys.map((k) => { const v = String(r[k] ?? "").replace(/"/g, '""'); return /[,"\n]/.test(v) ? `"${v}"` : v; }).join(",")
  )].join("\n");
}

export function dlBlob(content: string, filename: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename; a.click();
}
// ── transaction export rows ───────────────────────────────────────────────────

/** The minimum a transaction needs to be exportable. */
export interface ExportableTxn {
  occurred_at: string;
  type: string;
  category: string;
  description: string | null;
  amount: number | string;
  currency: string;
  account_id?: string | null;
  payment_mode?: string | null;
  tracker_id?: string | null;
  created_at?: string;
}

/**
 * One transaction as a row of the main export.
 *
 * This existed TWICE, declared identically inside `handleCSV` and
 * `handleExcel` (Export.tsx:108 and :118), so the CSV and the spreadsheet
 * could drift apart on any edit and nothing would notice. Extracting it makes
 * that impossible and makes the shape testable.
 *
 * ⚠️ `Tracker` is appended LAST. Every column before it keeps the position it
 * has always had, so a spreadsheet or script somebody already built against
 * `expenses.csv` keeps working — a new column at the end is additive, a new
 * column in the middle silently shifts everything after it.
 */
export function txnExportRow(t: ExportableTxn, trackerNames?: ReadonlyMap<string, string>) {
  return {
    Date: t.occurred_at.slice(0, 10),
    Type: t.type,
    Category: t.category,
    Description: clean(t.description),
    Amount: Number(t.amount),
    Currency: t.currency,
    Tracker: (t.tracker_id && trackerNames?.get(t.tracker_id)) || "",
  };
}

/**
 * The richer row a tracker-scoped export uses.
 *
 * Wider than the main export on purpose: someone exporting one project is
 * reconciling it, and wants the time, the account, how it was paid and when
 * it was recorded. The main export stays narrow so its long-standing column
 * order is not disturbed.
 */
export function trackerExportRow(
  t: ExportableTxn,
  ctx: {
    trackerName: string;
    accountName: (id: string | null) => string;
    /** Splits "Sub · note" when the prefix names a real subcategory. */
    splitSub: (desc: string | null) => { sub: string; note: string };
  },
) {
  const d = new Date(t.occurred_at);
  const { sub, note } = ctx.splitSub(clean(t.description));
  return {
    Date: t.occurred_at.slice(0, 10),
    Time: Number.isFinite(d.getTime())
      ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
      : "",
    Description: note,
    Category: t.category,
    Subcategory: sub,
    Tracker: ctx.trackerName,
    Account: ctx.accountName(t.account_id ?? null),
    "Payment Mode": t.payment_mode ?? "",
    Amount: Number(t.amount),
    Currency: t.currency,
    "Transaction Type": t.type,
    "Created At": t.created_at ? t.created_at.slice(0, 10) : "",
  };
}

/** Filename-safe slug of a tracker name. */
export function trackerExportFilename(name: string, ext: "csv" | "xlsx"): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "tracker";
  return `finroot-${slug}.${ext}`;
}

/**
 * A worksheet name Excel will actually accept: 31 chars max, and none of
 * `\ / ? * [ ]`. xlsx does not validate this — it writes a file Excel then
 * refuses to open, which is the worst possible time to find out.
 */
/**
 * Excel forbids these seven characters in a sheet name.
 *
 * Written as an explicit set rather than a regex character class on purpose:
 * the class needs a doubled backslash to match a literal one, and an autofix
 * that "tidies" it to a single backslash turns it into an escaped `?` — the
 * set silently stops containing backslash and Excel refuses the file. A Set
 * of one-character strings cannot be mis-escaped.
 */
const FORBIDDEN_SHEET_CHARS = new Set(["\\", "/", "?", "*", "[", "]", ":"]);

export function trackerSheetName(name: string): string {
  const cleaned = Array.from(name)
    .map((ch) => (FORBIDDEN_SHEET_CHARS.has(ch) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Tracker").slice(0, 31);
}

