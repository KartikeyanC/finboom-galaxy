import { describe, it, expect } from "vitest";
import {
  rowsFromScanResult,
  reconcileTotal,
  moveImage,
  removeImage,
  validateNewFiles,
  partitionRows,
  type ScanResult,
  type StagedImage,
} from "./billScan";

const TODAY = "2021-02-13";

const RECEIPT: ScanResult = {
  merchant: "Oudh 1590",
  date: "2021-02-13",
  currency: "INR",
  subtotal: 1860,
  items: [
    { name: "Awadhi Handi Biryani Full", qty: 2, unit: "pc", unitPrice: 395, amount: 790, category: "Food & Dining" },
    { name: "Galawati Kabab (Mutton)", qty: 1, unit: "pc", unitPrice: 350, amount: 350, category: "Food & Dining" },
    { name: "Gosht Roghan Josh", qty: 1, unit: "pc", unitPrice: 340, amount: 340, category: "Food & Dining" },
    { name: "Phirni", qty: 3, unit: "pc", unitPrice: 90, amount: 270, category: "Food & Dining" },
    { name: "Soda Sikanji", qty: 1, unit: "pc", unitPrice: 110, amount: 110, category: "Food & Dining" },
  ],
  taxLines: [
    { label: "CGST 2.5%", amount: 46.5 },
    { label: "SGST 2.5%", amount: 46.5 },
  ],
  total: 1953,
};

describe("rowsFromScanResult", () => {
  it("line-item mode returns one row per item plus one row per tax line, not merged", () => {
    const rows = rowsFromScanResult(RECEIPT, "lineItem", TODAY);
    expect(rows).toHaveLength(7); // 5 items + CGST + SGST, each their own row
    expect(rows.slice(0, 5).map((r) => r.name)).toEqual([
      "Awadhi Handi Biryani Full", "Galawati Kabab (Mutton)", "Gosht Roghan Josh", "Phirni", "Soda Sikanji",
    ]);
    expect(rows[0]).toMatchObject({ qty: 2, unit: "pc", amount: 790, category: "Food & Dining", kind: "item" });
    expect(rows[5]).toMatchObject({ name: "CGST 2.5%", amount: 46.5, kind: "tax" });
    expect(rows[6]).toMatchObject({ name: "SGST 2.5%", amount: 46.5, kind: "tax" });
  });

  it("keeps a Round Off line separate from CGST/SGST too", () => {
    const withRoundOff: ScanResult = {
      ...RECEIPT,
      taxLines: [...RECEIPT.taxLines, { label: "Round Off", amount: -0.5 }],
    };
    const rows = rowsFromScanResult(withRoundOff, "lineItem", TODAY);
    expect(rows).toHaveLength(8);
    expect(rows[7]).toMatchObject({ name: "Round Off", amount: -0.5 });
  });

  it("skips tax rows entirely when there is no tax", () => {
    const noTax: ScanResult = { ...RECEIPT, taxLines: [] };
    const rows = rowsFromScanResult(noTax, "lineItem", TODAY);
    expect(rows).toHaveLength(5);
  });

  it("lumpsum mode collapses to one row using the receipt's own stated total, not a re-sum", () => {
    // Deliberately mismatched from the sum of items, to prove it uses `total`.
    const mismatched: ScanResult = { ...RECEIPT, total: 1999 };
    const rows = rowsFromScanResult(mismatched, "lumpsum", TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1999);
    expect(rows[0].name).toBe("Oudh 1590");
  });

  it("falls back to today's date when the receipt has none", () => {
    const noDate: ScanResult = { ...RECEIPT, date: null };
    const rows = rowsFromScanResult(noDate, "lumpsum", TODAY);
    expect(rows[0].date).toBe(TODAY);
  });

  it("uses the receipt's own date when present, not today", () => {
    const rows = rowsFromScanResult(RECEIPT, "lumpsum", "2099-01-01");
    expect(rows[0].date).toBe("2021-02-13");
  });
});

describe("partitionRows", () => {
  it("separates purchased items from tax/adjustment lines for the summary strip", () => {
    const rows = rowsFromScanResult(RECEIPT, "lineItem", TODAY);
    const { items, taxes } = partitionRows(rows);
    expect(items).toHaveLength(5);
    expect(items.every((r) => r.kind === "item")).toBe(true);
    expect(taxes).toHaveLength(2);
    expect(taxes.map((t) => t.name)).toEqual(["CGST 2.5%", "SGST 2.5%"]);
  });

  it("lumpsum mode's single row is an item, never routed to the tax strip", () => {
    const { items, taxes } = partitionRows(rowsFromScanResult(RECEIPT, "lumpsum", TODAY));
    expect(items).toHaveLength(1);
    expect(taxes).toHaveLength(0);
  });
});

describe("reconcileTotal", () => {
  it("matches when the rows sum to the stated total", () => {
    const rows = rowsFromScanResult(RECEIPT, "lineItem", TODAY);
    const check = reconcileTotal(rows, RECEIPT.total);
    expect(check.matches).toBe(true);
    expect(check.computed).toBe(1953);
  });

  it("flags a real mismatch — a dropped line item", () => {
    const rows = rowsFromScanResult(RECEIPT, "lineItem", TODAY).slice(0, 4); // drop Soda Sikanji + tax
    const check = reconcileTotal(rows, RECEIPT.total);
    expect(check.matches).toBe(false);
    expect(check.diff).toBeLessThan(0);
  });

  it("tolerates a few paise of rounding drift", () => {
    const rows = rowsFromScanResult(RECEIPT, "lineItem", TODAY);
    const check = reconcileTotal(rows, RECEIPT.total + 0.3);
    expect(check.matches).toBe(true);
  });
});

function image(id: string): StagedImage {
  return { id, file: new File(["x"], `${id}.jpg`, { type: "image/jpeg" }), previewUrl: `blob:${id}` };
}

describe("moveImage / removeImage — the manual multi-page reorder", () => {
  it("moves an image earlier", () => {
    const imgs = [image("a"), image("b"), image("c")];
    const next = moveImage(imgs, 2, -1);
    expect(next.map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("moves an image later", () => {
    const imgs = [image("a"), image("b"), image("c")];
    const next = moveImage(imgs, 0, 1);
    expect(next.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op past either end", () => {
    const imgs = [image("a"), image("b")];
    expect(moveImage(imgs, 0, -1).map((i) => i.id)).toEqual(["a", "b"]);
    expect(moveImage(imgs, 1, 1).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const imgs = [image("a"), image("b")];
    const original = imgs.slice();
    moveImage(imgs, 0, 1);
    expect(imgs).toEqual(original);
  });

  it("removes exactly the targeted image", () => {
    const imgs = [image("a"), image("b"), image("c")];
    expect(removeImage(imgs, "b").map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("validateNewFiles", () => {
  const jpg = (name: string, size = 1000) => {
    const f = new File([new Uint8Array(size)], name, { type: "image/jpeg" });
    return f;
  };

  it("accepts up to 5 images total across multiple calls", () => {
    const { accepted, rejected } = validateNewFiles(0, [jpg("a"), jpg("b")]);
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });

  it("rejects anything past the 5-image cap, counting what's already staged", () => {
    const { accepted, rejected } = validateNewFiles(4, [jpg("a"), jpg("b")]);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/only 5/i);
  });

  it("rejects a disallowed mime type", () => {
    const pdf = new File([new Uint8Array(10)], "bill.pdf", { type: "application/pdf" });
    const { accepted, rejected } = validateNewFiles(0, [pdf]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/jpg, png or webp/i);
  });

  it("rejects an oversized image", () => {
    const big = jpg("huge.jpg", 9 * 1024 * 1024);
    const { accepted, rejected } = validateNewFiles(0, [big]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/8mb/i);
  });
});
