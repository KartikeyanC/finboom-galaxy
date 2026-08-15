/**
 * Stage 3.3 / BUG-043 — policy documents in Supabase Storage.
 *
 * Documents used to be base64 data URLs inside `insurance.document_data_url`,
 * with no size limit whatsoever. Every Insurance page load pulled every
 * policy's full document down inside the row.
 *
 * ⚠️ The object path IS the access-control model. The insurance-docs bucket's
 * RLS derives the owning workspace from the FIRST path segment, so an object
 * written anywhere else is either unreachable or, worse, attributed to the
 * wrong workspace. `documentPath()` is the only sanctioned way to build one.
 *
 * The limits below mirror the bucket's `file_size_limit` and
 * `allowed_mime_types`. The server is what actually enforces them — these exist
 * so the user gets a sentence instead of a failed upload.
 */

export const INSURANCE_BUCKET = "insurance-docs";

/** Mirrors the bucket's allowed_mime_types. */
export const ALLOWED_DOC_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Mirrors the bucket's file_size_limit (10 MB). */
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

/** For the file picker's `accept` attribute. */
export const DOC_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

/**
 * Strip anything that could change how a path is interpreted.
 *
 * Traversal (`../`) is the obvious one, but a bare `/` matters just as much:
 * an extra segment shifts every later segment, and the bucket policy reads
 * segment 1 as the tenant id.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim();
  const finalName = cleaned.length > 0 ? cleaned : "document";
  // Keep well under the 1024-char object-name ceiling once prefixed.
  return finalName.length > 120 ? finalName.slice(-120) : finalName;
}

/**
 * `<tenant_id>/<policy_id>/<timestamp>-<file>`.
 *
 * The timestamp means replacing a document writes a NEW object rather than
 * overwriting, so a stale signed URL cannot silently start resolving to a
 * different file.
 */
export function documentPath(tenantId: string, policyId: string, fileName: string): string {
  return `${tenantId}/${policyId}/${Date.now()}-${safeFileName(fileName)}`;
}

/**
 * Why this file cannot be attached, or `null` when it can.
 *
 * Returns the reason rather than a `{ok, reason}` union deliberately: this
 * project compiles with `strict: false`, so TypeScript will not narrow a
 * boolean-discriminated union and `verdict.reason` would not type-check at the
 * call site. A nullable string needs no narrowing and reads the same.
 *
 * Type is judged by MIME first and extension second: browsers leave
 * `file.type` empty for some PDFs, and rejecting those would be a worse bug
 * than accepting a mislabelled one — the bucket rejects it either way.
 */
export function documentRejectionReason(
  file: { name: string; size: number; type: string },
): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_DOC_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `That file is ${mb} MB. The limit is 10 MB.`;
  }
  const byMime = (ALLOWED_DOC_MIMES as readonly string[]).includes(file.type);
  const byExt = /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
  if (!byMime && !byExt) return "Attach a PDF, PNG, JPG or WebP.";
  return null;
}

/** Best-effort content type when the browser gives us nothing. */
export function contentTypeFor(file: { name: string; type: string }): string {
  if ((ALLOWED_DOC_MIMES as readonly string[]).includes(file.type)) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/** True when a stored value is a legacy inline document rather than a path. */
export function isLegacyInlineDocument(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("data:");
}
