import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { TRANSFER_CATEGORY, transferNote, transferSourceId } from "./transferMeta";

/**
 * Stage 3.4 moved a transfer's source into the real `account_id` column, so the
 * encoder is gone. What is left here is READ-ONLY legacy parsing, for rows an
 * older client could have written after the backfill removed the prefixes.
 *
 * These still matter: a parse miss would detach a transfer from the account it
 * left, and that changes a balance.
 */

const ID = "6b1f1b3c-0d5f-4f5e-9d0a-2c9b7f4a1e22";
const LEGACY = (note = "") => `[Transfer|${ID}]${note ? " " + note : ""}`;

describe("legacy prefix parsing", () => {
  it("recovers the account id and the note", () => {
    expect(transferSourceId(LEGACY("Move to savings"))).toBe(ID);
    expect(transferNote(LEGACY("Move to savings"))).toBe("Move to savings");
  });

  it("handles a prefix with no note", () => {
    expect(transferSourceId(LEGACY())).toBe(ID);
    expect(transferNote(LEGACY())).toBe("");
  });

  it("keeps a note that itself contains brackets", () => {
    expect(transferNote(LEGACY("rent [Oct]"))).toBe("rent [Oct]");
    expect(transferSourceId(LEGACY("rent [Oct]"))).toBe(ID);
  });
});

describe("nothing writes the encoded prefix any more", () => {
  // The point of 3.4: account and payment mode are columns. A new writer
  // sneaking a `[Mode|id]` prefix back into description would reintroduce
  // exactly the dangling-reference problem the migration removed.
  const SRC = resolve(__dirname, "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });

  it("no source file builds a [something|something] description prefix", () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const src = readFileSync(f, "utf8");
      // Template literal beginning `[${x}|...
      if (/`\[\$\{[^}]+\}\|/.test(src)) offenders.push(relative(SRC, f));
    }
    expect(offenders).toEqual([]);
  });
});

describe("transferSourceId", () => {
  it("is null for a description with no prefix", () => {
    expect(transferSourceId("just a note")).toBeNull();
    expect(transferSourceId(null)).toBeNull();
    expect(transferSourceId(undefined)).toBeNull();
  });

  it("is null when the prefix carries a mode but no account", () => {
    expect(transferSourceId("[UPI] coffee")).toBeNull();
  });

  it("reads the account out of an income/expense prefix too", () => {
    // Same scheme, so balances can treat every transaction type alike.
    expect(transferSourceId(`[UPI|${ID}] coffee`)).toBe(ID);
  });
});

describe("transferNote", () => {
  it("strips the prefix and surrounding space", () => {
    expect(transferNote(`[Transfer|${ID}]   salary sweep `)).toBe("salary sweep");
  });

  it("returns an empty string for an empty description", () => {
    expect(transferNote(null)).toBe("");
    expect(transferNote("")).toBe("");
  });
});

describe("TRANSFER_CATEGORY", () => {
  it("is a single fixed value so transfers group together", () => {
    expect(TRANSFER_CATEGORY).toBe("Transfer");
  });
});
