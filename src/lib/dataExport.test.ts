import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPORT_TABLES,
  FORMAT_VERSION,
  NOT_PERSONAL,
  buildExportBundle,
  bundleFilename,
  totalRows,
  type ExportScope,
} from "./dataExport";

/**
 * Stage 5.2. The export is a legal promise, so the tests are about the two
 * ways it can quietly break that promise: leaving a table out, and hiding a
 * failure. The first test is the important one — it reads the generated
 * database types and fails when a new table is neither exported nor explicitly
 * declared impersonal.
 */

const base = {
  user: { id: "u1", email: "demo@finroot.app" },
  workspace: { id: "t1", name: "Demo" },
  application: "FinRoot",
  listDocuments: async () => [],
};

describe("schema coverage", () => {
  const types = readFileSync(resolve(__dirname, "../integrations/supabase/types.ts"), "utf8");
  // `supabase gen types` now emits a `graphql_public` schema (an empty
  // `Tables: { [_ in never]: never }`) ahead of `public` — the first
  // "Tables: {"/"Views: {" in the file belong to it, not to the real schema.
  // Anchoring past `public: {` first keeps this test scoped to real tables
  // instead of silently checking an empty segment and passing vacuously.
  const publicIdx = types.indexOf("\n  public: {");
  const segment = types.slice(types.indexOf("Tables: {", publicIdx), types.indexOf("Views: {", publicIdx));
  const tableNames = [...segment.matchAll(/^ {6}([a-z_]+): \{$/gm)].map((m) => m[1]);

  it("finds the tables in the generated types (the guard is not vacuous)", () => {
    // If the generated file's shape changes, this test must fail loudly rather
    // than pass by matching nothing.
    expect(tableNames.length).toBeGreaterThan(20);
    expect(tableNames).toContain("transactions");
  });

  it("accounts for EVERY table: exported, or declared not personal with a reason", () => {
    const exported = new Set(EXPORT_TABLES.map((t) => t.table));
    const unaccounted = tableNames.filter((n) => !exported.has(n) && !(n in NOT_PERSONAL));
    expect(
      unaccounted,
      `New table(s) with no export decision: ${unaccounted.join(", ")}. Add them to EXPORT_TABLES ` +
        "if they can hold personal data, or to NOT_PERSONAL with a reason.",
    ).toEqual([]);
  });

  it("does not export a table that no longer exists", () => {
    const stale = EXPORT_TABLES.map((t) => t.table).filter((t) => !tableNames.includes(t));
    expect(stale, `EXPORT_TABLES references missing table(s): ${stale.join(", ")}`).toEqual([]);
  });

  it("gives every impersonal table a non-empty reason", () => {
    for (const [table, reason] of Object.entries(NOT_PERSONAL)) {
      expect(reason.trim().length, table).toBeGreaterThan(10);
    }
  });

  it("lists each exported table once, with a description", () => {
    const seen = new Set<string>();
    for (const t of EXPORT_TABLES) {
      expect(seen.has(t.table), `${t.table} listed twice`).toBe(false);
      seen.add(t.table);
      expect(t.what.trim().length, t.table).toBeGreaterThan(3);
    }
  });
});

describe("buildExportBundle", () => {
  it("reads every listed table and counts the rows", async () => {
    const seen: { table: string; scope: ExportScope }[] = [];
    const bundle = await buildExportBundle({
      ...base,
      readTable: async (table, scope) => {
        seen.push({ table, scope });
        return [{ id: `${table}-1` }];
      },
    });
    expect(seen.map((s) => s.table)).toEqual(EXPORT_TABLES.map((t) => t.table));
    expect(Object.keys(bundle.data)).toHaveLength(EXPORT_TABLES.length);
    expect(totalRows(bundle)).toBe(EXPORT_TABLES.length);
  });

  it("passes each table its declared scope", async () => {
    const scopes: Record<string, ExportScope> = {};
    await buildExportBundle({
      ...base,
      readTable: async (table, scope) => {
        scopes[table] = scope;
        return [];
      },
    });
    expect(scopes.profiles).toBe("self");
    expect(scopes.notifications).toBe("user");
    expect(scopes.transactions).toBe("tenant");
    // `tenants` is keyed by `id`, not `tenant_id`. Filtering it as a tenant
    // table asks PostgREST for a column that does not exist, and the whole
    // table drops out of the export — which is how this was found.
    expect(scopes.tenants).toBe("workspace");
  });

  it("records a failed table instead of dropping it silently", async () => {
    const bundle = await buildExportBundle({
      ...base,
      readTable: async (table) => {
        if (table === "audit_log") throw new Error("permission denied");
        return [];
      },
    });
    expect(bundle.data).not.toHaveProperty("audit_log");
    expect(bundle.manifest.included).not.toHaveProperty("audit_log");
    expect(bundle.manifest.unavailable).toContainEqual({ table: "audit_log", reason: "permission denied" });
  });

  it("keeps going after a failure, so one dead table cannot empty the export", async () => {
    const bundle = await buildExportBundle({
      ...base,
      readTable: async (table) => {
        if (table === "profiles") throw new Error("nope");
        return [{ id: 1 }];
      },
    });
    expect(bundle.manifest.unavailable).toHaveLength(1);
    expect(totalRows(bundle)).toBe(EXPORT_TABLES.length - 1);
  });

  it("records a document-listing failure too", async () => {
    const bundle = await buildExportBundle({
      ...base,
      readTable: async () => [],
      listDocuments: async () => { throw new Error("storage down"); },
    });
    expect(bundle.manifest.unavailable).toContainEqual({ table: "documents", reason: "storage down" });
    expect(bundle.documents).toEqual([]);
  });

  it("writes a manifest that identifies the subject and the moment", async () => {
    const now = new Date("2026-08-11T10:30:00.000Z");
    const bundle = await buildExportBundle({ ...base, readTable: async () => [], now });
    expect(bundle.manifest.generated_at).toBe("2026-08-11T10:30:00.000Z");
    expect(bundle.manifest.format_version).toBe(FORMAT_VERSION);
    expect(bundle.manifest.user).toEqual({ id: "u1", email: "demo@finroot.app" });
    expect(bundle.manifest.workspace).toEqual({ id: "t1", name: "Demo" });
  });

  it("says in the file itself that the PIN and invite tokens are not in it", async () => {
    const bundle = await buildExportBundle({ ...base, readTable: async () => [] });
    const notes = bundle.manifest.notes.join(" ").toLowerCase();
    expect(notes).toContain("pin");
    expect(notes).toContain("token");
  });

  it("lists uploaded documents without embedding them", async () => {
    const bundle = await buildExportBundle({
      ...base,
      readTable: async () => [],
      listDocuments: async () => [
        { bucket: "insurance-docs", path: "t1/policy.pdf", size: 1024, updated_at: "2026-08-01T00:00:00Z" },
      ],
    });
    expect(bundle.documents).toHaveLength(1);
    expect(JSON.stringify(bundle)).not.toContain("base64");
  });
});

describe("bundleFilename", () => {
  it("is dated and slugged from the app name", () => {
    expect(bundleFilename(new Date("2026-08-11T22:00:00Z"), "FinRoot")).toBe("finroot-data-export-2026-08-11.json");
  });

  it("survives an app name that is punctuation", () => {
    expect(bundleFilename(new Date("2026-01-02T00:00:00Z"), "!!!")).toBe("export-data-export-2026-01-02.json");
  });
});
