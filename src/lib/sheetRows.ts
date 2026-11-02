/**
 * Reading a table out of a real-world export, wherever it sits.
 *
 * Broker and bank exports rarely start with their column headers. A Zerodha
 * tradebook (.xlsx) has ~14 rows of account details first ("Client ID",
 * "Tradebook for Equity from … to …") and an empty column A; a PDF has a
 * letterhead. Treating row 1 as the header — what `sheet_to_json` and
 * Papa's `header: true` do — turns those files into zero rows ("No rows
 * detected"). Here the header is the first row that names at least two
 * columns we know, and every row under it is read against that header.
 *
 * Pure: plain arrays in, plain objects out — the xlsx worker, Papa and
 * pdf.js each produce the grid, and this file is what the tests exercise.
 */

export type Cell = unknown;
export type Grid = Cell[][];

/** "Avg. Price" / "trade_date" / " Trade  Date " → "avg price" / "trade date". */
export const normHeader = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isBlank = (v: unknown) => String(v ?? "").trim() === "";

/**
 * The header row: the first row naming at least two of [known] columns, or
 * — when no [known] set is given — the first row with two or more filled
 * cells. -1 when there is none.
 */
export function findHeaderRow(grid: Grid, known?: ReadonlySet<string>): number {
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const hits = known
      ? row.filter((c) => known.has(normHeader(c))).length
      : row.filter((c) => !isBlank(c)).length;
    if (hits >= 2) return i;
  }
  return -1;
}

/**
 * Rows under the header as objects keyed by the header text (as written).
 * Columns with no header are dropped. A header row that repeats further down
 * (a PDF page break, a second table) is skipped rather than read as data.
 * A row of empty cells is kept — callers count it as skipped (BUG-108) —
 * but a row with no cells at all is not a row.
 */
export function gridToObjects(
  grid: Grid,
  known?: ReadonlySet<string>,
): Record<string, unknown>[] {
  const h = findHeaderRow(grid, known);
  if (h < 0) return [];
  const header = (grid[h] ?? []).map((c) => String(c ?? "").trim());
  const headerKey = header.map(normHeader).join("|");
  const out: Record<string, unknown>[] = [];
  for (const row of grid.slice(h + 1)) {
    if (!row || row.length === 0) continue;
    if (row.map(normHeader).join("|") === headerKey) continue;
    const obj: Record<string, unknown> = {};
    header.forEach((name, i) => {
      if (name) obj[name] = row[i] ?? "";
    });
    out.push(obj);
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Apr" / "April" / "SEPT" → 4 / 4 / 9; 0 when it is not a month. */
const monthOf = (word: string) => MONTHS[word.slice(0, 3).toLowerCase()] ?? 0;

const pad = (n: number) => String(n).padStart(2, "0");

function ymd(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  if (m < 1 || m > 12 || d < 1 || d > 31 || year < 1900 || year > 2100) return null;
  const check = new Date(Date.UTC(year, m - 1, d));
  if (check.getUTCMonth() !== m - 1) return null;
  return `${year}-${pad(m)}-${pad(d)}`;
}

/**
 * Any date a broker or bank export writes, as "yyyy-mm-dd" — or "" when it
 * is not a date. Indian exports put the day first, so "03/04/2024" is
 * 3 April, never 4 March (which `new Date()` would make it).
 *
 *   45397 (an Excel serial)        → 2024-04-15
 *   "2024-04-15" / "2024-04-15T10:01:02"
 *   "15-04-2024" / "15/04/2024" / "15.04.24"
 *   "15-Apr-2024" / "15 Apr 2024" / "Apr 15, 2024"
 */
export function normaliseDate(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel's day 1 is 1900-01-01, with its phantom 29 Feb 1900: serials count
    // from 1899-12-30. Only a plausible range counts (1954 … 2119).
    if (v < 20000 || v > 80000) return "";
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{5}(\.\d+)?$/.test(s)) return normaliseDate(Number(s));

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]) ?? "";

  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})\b/);
  if (m) return ymd(+m[3], +m[2], +m[1]) ?? "";

  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ,]+(\d{2,4})\b/);
  if (m && monthOf(m[2])) return ymd(+m[3], monthOf(m[2]), +m[1]) ?? "";

  m = s.match(/^([A-Za-z]{3,9})[ -](\d{1,2}),?[ -](\d{2,4})\b/);
  if (m && monthOf(m[1])) return ymd(+m[3], monthOf(m[1]), +m[2]) ?? "";
  return "";
}

/** One piece of text on a PDF page, where pdf.js put it. */
export type PdfText = { text: string; x: number; y: number; width: number };

/**
 * A PDF page's text pieces as table rows: pieces on the same baseline form a
 * line, pieces closer than [gap] points on a line join into one cell
 * ("Trade" + "Date" → "Trade Date"), and each cell remembers where it sits.
 */
export function pdfLines(
  items: PdfText[],
  gap = 4,
): { text: string; x: number; end: number }[][] {
  const byY = new Map<number, PdfText[]>();
  for (const it of items) {
    if (!it.text.trim()) continue;
    // Baselines within a point or two are the same line.
    const key = Math.round(it.y / 2);
    byY.set(key, [...(byY.get(key) ?? []), it]);
  }
  return [...byY.entries()]
    .sort((a, b) => b[0] - a[0]) // PDF y grows upwards: top line first
    .map(([, line]) => {
      const cells: { text: string; x: number; end: number }[] = [];
      for (const it of [...line].sort((a, b) => a.x - b.x)) {
        const last = cells[cells.length - 1];
        if (last && it.x - last.end <= gap) {
          last.text = `${last.text} ${it.text.trim()}`.trim();
          last.end = Math.max(last.end, it.x + it.width);
        } else {
          cells.push({ text: it.text.trim(), x: it.x, end: it.x + it.width });
        }
      }
      return cells;
    });
}

/**
 * PDF lines as a grid laid out under the header's columns: each cell goes to
 * the header column whose centre is nearest its own (numbers sit right-
 * aligned under a left-aligned header, so starts alone would misplace them).
 */
export function pdfLinesToGrid(
  lines: { text: string; x: number; end: number }[][],
  known: ReadonlySet<string>,
): Grid {
  const asGrid = lines.map((l) => l.map((c) => c.text));
  const h = findHeaderRow(asGrid, known);
  if (h < 0) return [];
  const header = lines[h];
  const centres = header.map((c) => (c.x + c.end) / 2);
  const grid: Grid = [header.map((c) => c.text)];
  for (const line of lines.slice(h + 1)) {
    const row: string[] = header.map(() => "");
    for (const c of line) {
      const mid = (c.x + c.end) / 2;
      let best = 0;
      for (let i = 1; i < centres.length; i++) {
        if (Math.abs(centres[i] - mid) < Math.abs(centres[best] - mid)) best = i;
      }
      row[best] = row[best] ? `${row[best]} ${c.text}` : c.text;
    }
    grid.push(row);
  }
  return grid;
}
