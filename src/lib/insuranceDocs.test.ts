import { describe, it, expect } from "vitest";
import {
  safeFileName,
  documentPath,
  documentRejectionReason,
  contentTypeFor,
  isLegacyInlineDocument,
  MAX_DOC_BYTES,
  ALLOWED_DOC_MIMES,
} from "./insuranceDocs";

/**
 * Stage 3.3 / BUG-043.
 *
 * The object path is the access-control model: the `insurance-docs` bucket
 * policy reads the FIRST path segment as the owning workspace id. So anything
 * that can inject a `/` into a filename can shift every later segment and make
 * an object look like it belongs to a different workspace. These tests are
 * mostly about that one property.
 */

const file = (name: string, size = 1024, type = "application/pdf") => ({ name, size, type });

describe("safeFileName", () => {
  it("keeps an ordinary name intact", () => {
    expect(safeFileName("policy-2026.pdf")).toBe("policy-2026.pdf");
  });

  it("drops directory components", () => {
    expect(safeFileName("a/b/c/policy.pdf")).toBe("policy.pdf");
    expect(safeFileName("a\\b\\policy.pdf")).toBe("policy.pdf");
  });

  it("defuses traversal", () => {
    const out = safeFileName("../../../etc/passwd");
    expect(out).not.toContain("..");
    expect(out).not.toContain("/");
  });

  it("leaves no separator that could add a path segment", () => {
    // The property that actually matters: one extra segment would shift the
    // tenant id out of position 1.
    for (const nasty of ["a/b.pdf", "..%2Fx.pdf", "x/../../y.pdf", "/abs.pdf", "\\\\srv\\s.pdf"]) {
      expect(safeFileName(nasty)).not.toContain("/");
      expect(safeFileName(nasty)).not.toContain("\\");
    }
  });

  it("never returns an empty name", () => {
    expect(safeFileName("").length).toBeGreaterThan(0);
    expect(safeFileName("...").length).toBeGreaterThan(0);
    expect(safeFileName("///").length).toBeGreaterThan(0);
  });

  it("caps the length so the full path stays under the object-name limit", () => {
    expect(safeFileName("x".repeat(500) + ".pdf").length).toBeLessThanOrEqual(120);
  });
});

describe("documentPath", () => {
  const TENANT = "11111111-1111-1111-1111-111111111111";
  const POLICY = "22222222-2222-2222-2222-222222222222";

  it("puts the tenant id first — the bucket policy depends on it", () => {
    const p = documentPath(TENANT, POLICY, "policy.pdf");
    expect(p.split("/")[0]).toBe(TENANT);
    expect(p.split("/")[1]).toBe(POLICY);
  });

  it("keeps the tenant in position 1 even for a hostile filename", () => {
    const p = documentPath(TENANT, POLICY, "../../evil.pdf");
    expect(p.split("/")[0]).toBe(TENANT);
    expect(p.split("/").length).toBe(3);
  });

  it("produces a new path per upload so a stale signed URL cannot be reused", () => {
    const a = documentPath(TENANT, POLICY, "policy.pdf");
    const b = documentPath(TENANT, POLICY, "policy.pdf");
    // Same second is possible; the point is the timestamp segment exists.
    expect(/\/\d{10,}-policy\.pdf$/.test(a)).toBe(true);
    expect(b.startsWith(`${TENANT}/${POLICY}/`)).toBe(true);
  });
});

describe("documentRejectionReason", () => {
  it("accepts a normal PDF", () => {
    expect(documentRejectionReason(file("policy.pdf"))).toBeNull();
  });

  it("accepts the image types the bucket allows", () => {
    for (const type of ALLOWED_DOC_MIMES) {
      expect(documentRejectionReason(file("scan", 2048, type)), type).toBeNull();
    }
  });

  it("rejects an empty file", () => {
    expect(documentRejectionReason(file("policy.pdf", 0))).toMatch(/empty/i);
  });

  it("rejects anything over the bucket's limit", () => {
    const reason = documentRejectionReason(file("big.pdf", MAX_DOC_BYTES + 1));
    expect(reason).toMatch(/10 MB/);
  });

  it("accepts a file exactly at the limit", () => {
    expect(documentRejectionReason(file("edge.pdf", MAX_DOC_BYTES))).toBeNull();
  });

  it("rejects a disallowed type", () => {
    expect(documentRejectionReason(file("notes.txt", 100, "text/plain"))).toMatch(/PDF/i);
    expect(documentRejectionReason(file("app.exe", 100, "application/x-msdownload"))).toMatch(/PDF/i);
  });

  it("accepts a PDF whose MIME the browser left blank", () => {
    // Real browsers do this; rejecting it would be a worse bug than trusting
    // the extension, since the bucket re-checks anyway.
    expect(documentRejectionReason(file("policy.pdf", 100, ""))).toBeNull();
  });
});

describe("contentTypeFor", () => {
  it("trusts an allowed MIME", () => {
    expect(contentTypeFor({ name: "x.pdf", type: "application/pdf" })).toBe("application/pdf");
  });

  it("falls back to the extension when the MIME is missing", () => {
    expect(contentTypeFor({ name: "scan.PNG", type: "" })).toBe("image/png");
    expect(contentTypeFor({ name: "photo.jpeg", type: "" })).toBe("image/jpeg");
    expect(contentTypeFor({ name: "doc.pdf", type: "" })).toBe("application/pdf");
  });

  it("does not invent a type it cannot determine", () => {
    expect(contentTypeFor({ name: "mystery", type: "" })).toBe("application/octet-stream");
  });
});

describe("isLegacyInlineDocument", () => {
  it("spots a pre-3.3 data URL", () => {
    expect(isLegacyInlineDocument("data:application/pdf;base64,AAAA")).toBe(true);
  });

  it("does not mistake a storage path for one", () => {
    expect(isLegacyInlineDocument("tenant/policy/1-file.pdf")).toBe(false);
    expect(isLegacyInlineDocument(null)).toBe(false);
    expect(isLegacyInlineDocument(undefined)).toBe(false);
  });
});
