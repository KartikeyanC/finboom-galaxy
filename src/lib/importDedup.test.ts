import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import {
  canonicalImportKey,
  computeImportHash,
  withImportHashes,
  type ImportHashInput,
} from "./importDedup";

// jsdom does not provide crypto.subtle.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

const row = (o: Partial<ImportHashInput> = {}): ImportHashInput => ({
  type: "expense",
  amount: 250,
  currency: "INR",
  category: "Food & Dining",
  occurred_at: "2026-03-15T10:30:00.000Z",
  description: "Lunch",
  ...o,
});

describe("canonicalImportKey", () => {
  it("is stable for identical rows", () => {
    expect(canonicalImportKey(row())).toBe(canonicalImportKey(row()));
  });

  // Importers synthesise times when the source has none, so including the clock
  // would make the same row hash differently on every upload.
  it("ignores the time of day", () => {
    expect(canonicalImportKey(row({ occurred_at: "2026-03-15T23:59:00.000Z" })))
      .toBe(canonicalImportKey(row({ occurred_at: "2026-03-15T00:00:00.000Z" })));
  });

  it("still separates different dates", () => {
    expect(canonicalImportKey(row({ occurred_at: "2026-03-16T10:30:00.000Z" })))
      .not.toBe(canonicalImportKey(row()));
  });

  it("normalises amount formatting", () => {
    expect(canonicalImportKey(row({ amount: 250 }))).toBe(canonicalImportKey(row({ amount: "250.00" })));
    expect(canonicalImportKey(row({ amount: "250.0" }))).toBe(canonicalImportKey(row({ amount: 250 })));
  });

  it("normalises casing and stray whitespace", () => {
    expect(canonicalImportKey(row({ description: "  LUNCH " }))).toBe(canonicalImportKey(row()));
  });

  it("treats null and empty description alike", () => {
    expect(canonicalImportKey(row({ description: null }))).toBe(canonicalImportKey(row({ description: "" })));
  });

  it("distinguishes rows that genuinely differ", () => {
    const base = canonicalImportKey(row());
    expect(canonicalImportKey(row({ amount: 251 }))).not.toBe(base);
    expect(canonicalImportKey(row({ category: "Transport" }))).not.toBe(base);
    expect(canonicalImportKey(row({ type: "income" }))).not.toBe(base);
    expect(canonicalImportKey(row({ currency: "USD" }))).not.toBe(base);
    expect(canonicalImportKey(row({ description: "Dinner" }))).not.toBe(base);
  });
});

describe("computeImportHash", () => {
  it("returns a 64-char hex sha-256", async () => {
    const h = await computeImportHash(row());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    expect(await computeImportHash(row())).toBe(await computeImportHash(row()));
  });

  it("differs when content differs", async () => {
    expect(await computeImportHash(row())).not.toBe(await computeImportHash(row({ amount: 999 })));
  });
});

describe("withImportHashes", () => {
  it("hashes every row and reports no duplicates for distinct input", async () => {
    const { rows, duplicatesInFile } = await withImportHashes([
      row({ amount: 1 }),
      row({ amount: 2 }),
      row({ amount: 3 }),
    ]);
    expect(rows).toHaveLength(3);
    expect(duplicatesInFile).toBe(0);
    expect(new Set(rows.map((r) => r.import_hash)).size).toBe(3);
  });

  // A single file can repeat a row; those would collide with each other inside
  // one statement, so they are dropped before the request is sent.
  it("collapses rows repeated within the same file", async () => {
    const { rows, duplicatesInFile } = await withImportHashes([row(), row(), row({ amount: 500 })]);
    expect(rows).toHaveLength(2);
    expect(duplicatesInFile).toBe(1);
  });

  it("keeps the original fields alongside the hash", async () => {
    const { rows } = await withImportHashes([row()]);
    expect(rows[0]).toMatchObject({ type: "expense", amount: 250, category: "Food & Dining" });
    expect(rows[0].import_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles an empty batch", async () => {
    const { rows, duplicatesInFile } = await withImportHashes([]);
    expect(rows).toEqual([]);
    expect(duplicatesInFile).toBe(0);
  });

  it("gives the same hashes when the identical file is processed twice", async () => {
    const a = await withImportHashes([row({ amount: 10 }), row({ amount: 20 })]);
    const b = await withImportHashes([row({ amount: 10 }), row({ amount: 20 })]);
    expect(a.rows.map((r) => r.import_hash)).toEqual(b.rows.map((r) => r.import_hash));
  });
});
