/**
 * Pure logic behind the real receipt scanner (BillScan.tsx). Split out so the
 * mapping/arithmetic can be tested without a browser or a network call — see
 * CLAUDE.md's file-size guidance on extracting the pure part.
 *
 * Previously `handleFile` in BillScan.tsx ran a `setTimeout` and filled in a
 * fixed `SAMPLE_ITEMS` array regardless of what was uploaded (the file's
 * *name* drove a regex "merchant" guess; the image content was never read).
 * `scan-receipt` now actually reads the image via Gemini vision; this module
 * turns its response into what the review UI and `useCreateTransaction`
 * already expect.
 */

export const UNITS = ["pc", "pk", "kg", "g", "L", "ml"] as const;
export type Unit = (typeof UNITS)[number];

export type ScannedRow = {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  qty: number;
  unit: Unit;
  /** "item": a real purchased line, shown as a full editable card. "tax": a
   * CGST/SGST/service-charge/round-off line, shown in the compact summary
   * strip instead — it still becomes its own logged transaction on approve,
   * just with a lighter-weight editor since qty/unit/category don't apply
   * to it the way they do a purchase. */
  kind: "item" | "tax";
};

export interface ScanResultItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  category: string;
}

export interface ScanResultTaxLine {
  label: string;
  amount: number;
}

export interface ScanResult {
  merchant: string;
  date: string | null;
  currency: string;
  subtotal: number | null;
  items: ScanResultItem[];
  taxLines: ScanResultTaxLine[];
  total: number;
}

function toUnit(u: string): Unit {
  return (UNITS as readonly string[]).includes(u) ? (u as Unit) : "pc";
}

/**
 * Line-item mode: one row per extracted item, plus one row for tax if the
 * receipt had any (an itemized tax line, kept out of any single item's
 * category so a discount does not distort the item that happens to sit next
 * to it). Lumpsum mode: one row for the whole receipt, using its stated
 * total — not the sum of items, so it matches what was actually charged
 * even if the AI missed a line.
 */
export function rowsFromScanResult(
  result: ScanResult,
  mode: "lumpsum" | "lineItem",
  today: string,
): ScannedRow[] {
  const date = result.date ?? today;

  if (mode === "lumpsum") {
    return [
      {
        id: crypto.randomUUID(),
        name: result.merchant || "Receipt",
        category: result.items[0]?.category ?? "Shopping",
        amount: result.total,
        date,
        qty: 1,
        unit: "pc",
        kind: "item",
      },
    ];
  }

  const itemRows: ScannedRow[] = result.items.map((it) => ({
    id: crypto.randomUUID(),
    name: it.name,
    category: it.category,
    amount: it.amount,
    date,
    qty: it.qty,
    unit: toUnit(it.unit),
    kind: "item",
  }));

  // One row per tax/charge/round-off line, not lumped together — a CGST +
  // SGST + Round Off receipt gets three separate, individually editable
  // rows, matching how the items themselves are broken out.
  const taxRows: ScannedRow[] = result.taxLines
    .filter((t) => Math.abs(t.amount) > 0.005)
    .map((t) => ({
      id: crypto.randomUUID(),
      name: t.label || "Tax",
      category: result.items[0]?.category ?? "Shopping",
      amount: Math.round(t.amount * 100) / 100,
      date,
      qty: 1,
      unit: "pc" as Unit,
      kind: "tax",
    }));

  return [...itemRows, ...taxRows];
}

/**
 * Cross-checks the rows the user is about to approve against the receipt's
 * own printed total — the "perfect working condition" guard: a scan that
 * silently dropped or mis-read a line should be visible before it's logged,
 * not discovered later against a bank statement.
 */
export function reconcileTotal(rows: ScannedRow[], statedTotal: number) {
  const computed = Math.round(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;
  const stated = Math.round(statedTotal * 100) / 100;
  const diff = Math.round((computed - stated) * 100) / 100;
  // A few paise of rounding drift across several line items is normal and
  // not worth alarming over; anything past that is worth a second look.
  return { computed, stated, matches: Math.abs(diff) <= 0.5, diff };
}

/** Splits the review list into the item cards and the tax/adjustment
 * summary strip render separately — see `ScannedRow.kind`. */
export function partitionRows(rows: ScannedRow[]): { items: ScannedRow[]; taxes: ScannedRow[] } {
  return {
    items: rows.filter((r) => r.kind === "item"),
    taxes: rows.filter((r) => r.kind === "tax"),
  };
}

export interface StagedImage {
  id: string;
  file: File;
  previewUrl: string;
}

/** Move one staged image earlier (-1) or later (+1) in the upload order. */
export function moveImage(images: StagedImage[], index: number, direction: -1 | 1): StagedImage[] {
  const target = index + direction;
  if (index < 0 || index >= images.length || target < 0 || target >= images.length) return images;
  const next = images.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeImage(images: StagedImage[], id: string): StagedImage[] {
  return images.filter((img) => img.id !== id);
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 5;

export function validateNewFiles(
  existingCount: number,
  files: File[],
): { accepted: File[]; rejected: { file: File; reason: string }[] } {
  const accepted: File[] = [];
  const rejected: { file: File; reason: string }[] = [];
  let count = existingCount;
  for (const f of files) {
    if (count >= MAX_IMAGES) {
      rejected.push({ file: f, reason: `Only ${MAX_IMAGES} images per scan` });
      continue;
    }
    if (!ALLOWED_MIME.has(f.type)) {
      rejected.push({ file: f, reason: "Use JPG, PNG or WEBP" });
      continue;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      rejected.push({ file: f, reason: "Image is larger than 8MB" });
      continue;
    }
    accepted.push(f);
    count++;
  }
  return { accepted, rejected };
}

/** Reads a File as base64 (no `data:` prefix) for the scan-receipt payload. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
