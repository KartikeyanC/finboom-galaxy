import { describe, it, expect } from "vitest";
// A plain .mjs operator script: the CLI half is guarded behind a
// direct-invocation check so importing it here runs nothing.
import {
  chunk,
  describeRow,
  isFileEntry,
  isTenantPrefix,
  joinPrefix,
  outsidePrefix,
} from "../../scripts/storage-purge.mjs";

/**
 * BUG-086. `scripts/storage-purge.mjs` deletes documents belonging to workspaces
 * that no longer exist, with a service-role key and no undo. The network half is
 * thin on purpose; what is tested here is the part that decides **what is inside
 * the blast radius**, because the failure mode is not "the drain did not run" —
 * it is "the drain deleted a live workspace's insurance documents".
 */

const TENANT = "6f2b1c4e-9a3d-4b58-8e21-7c0d5a9f3b12";

describe("isTenantPrefix", () => {
  it("accepts exactly a tenant uuid with a trailing slash", () => {
    expect(isTenantPrefix(`${TENANT}/`)).toBe(true);
    expect(isTenantPrefix(TENANT.toUpperCase() + "/")).toBe(true);
  });

  it("rejects every prefix that would widen the blast radius", () => {
    // 🔴 Each of these, treated as a prefix, makes "starts with the prefix"
    // true for objects belonging to OTHER workspaces.
    for (const bad of ["", "/", "insurance-docs/", "*", TENANT, `${TENANT}`, "../", `${TENANT}/policy/`]) {
      expect(isTenantPrefix(bad), `should reject ${JSON.stringify(bad)}`).toBe(false);
    }
    expect(isTenantPrefix(null)).toBe(false);
    expect(isTenantPrefix(undefined)).toBe(false);
  });
});

describe("outsidePrefix", () => {
  const prefix = `${TENANT}/`;

  it("passes objects that really are under the workspace", () => {
    const paths = [`${prefix}policy-1/1700-a.pdf`, `${prefix}policy-2/1800-b.png`];
    expect(outsidePrefix(paths, prefix)).toEqual([]);
  });

  it("catches another workspace's object, a traversal, and the folder itself", () => {
    const other = "11111111-2222-3333-4444-555555555555/policy/x.pdf";
    const paths = [
      `${prefix}ok/a.pdf`,
      other,
      `${prefix}../escape.pdf`,
      prefix, // the folder, not a file — deleting "the prefix" is not a delete
    ];
    expect(outsidePrefix(paths, prefix)).toEqual([other, `${prefix}../escape.pdf`, prefix]);
  });

  it("treats EVERY path as outside when the prefix itself is not trustworthy", () => {
    // Fail closed: an unusable prefix must not degrade into "delete anything".
    const paths = [`${prefix}a.pdf`, "other/b.pdf"];
    expect(outsidePrefix(paths, "")).toEqual(paths);
    expect(outsidePrefix(paths, "/")).toEqual(paths);
  });

  it("rejects a non-string masquerading as a path", () => {
    expect(outsidePrefix([null, 42, `${prefix}a.pdf`] as unknown[], prefix)).toEqual([null, 42]);
  });
});

describe("listing helpers", () => {
  it("tells a file from a folder by the presence of an id", () => {
    // Supabase reports folders with a null id. Backwards, this either deletes
    // nothing or tries to delete directory names.
    expect(isFileEntry({ name: "a.pdf", id: "abc" })).toBe(true);
    expect(isFileEntry({ name: "policy-1", id: null })).toBe(false);
    expect(isFileEntry({ name: "policy-1" })).toBe(false);
    expect(isFileEntry(null)).toBe(false);
  });

  it("joins without doubling or dropping a slash", () => {
    expect(joinPrefix(`${TENANT}/`, "p/1.pdf")).toBe(`${TENANT}/p/1.pdf`);
    expect(joinPrefix(TENANT, "p/1.pdf")).toBe(`${TENANT}/p/1.pdf`);
    expect(joinPrefix(`${TENANT}/`, "/p/1.pdf")).toBe(`${TENANT}/p/1.pdf`);
  });

  it("batches deletes and never loses or duplicates a path", () => {
    const paths = Array.from({ length: 250 }, (_, i) => `${TENANT}/p/${i}.pdf`);
    const batches = chunk(paths, 100);
    expect(batches.map((b: string[]) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(paths);
    expect(chunk([], 100)).toEqual([]);
    expect(() => chunk(paths, 0)).toThrow();
  });
});

describe("describeRow", () => {
  it("gives the operator enough to decide before passing --apply", () => {
    const line = describeRow({
      bucket_id: "insurance-docs",
      path_prefix: `${TENANT}/`,
      object_count: 3,
      requested_at: "2026-08-01T10:00:00Z",
      last_error: null,
    });
    expect(line).toContain("insurance-docs");
    expect(line).toContain(TENANT);
    expect(line).toContain("3 objects");
  });

  it("surfaces a previous failure rather than hiding it", () => {
    const line = describeRow({
      bucket_id: "insurance-docs",
      path_prefix: `${TENANT}/`,
      object_count: null,
      requested_at: null,
      last_error: "delete: 403 forbidden",
    });
    expect(line).toContain("403 forbidden");
    expect(line).toContain("? objects");
  });
});
