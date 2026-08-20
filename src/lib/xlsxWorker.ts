/// <reference lib="webworker" />

/**
 * BUG-032 — `xlsx@0.18.5` has two unpatched advisories (prototype pollution,
 * ReDoS, GHSA-4r6h-8v6p-xvw6 / GHSA-5pgg-2g8v-p4x9) and SheetJS stopped
 * publishing npm fixes for this line. There is no version bump that closes
 * this — the mitigation the bug asks for is sandboxing: parsing untrusted
 * upload bytes somewhere a hostile file can't reach the DOM, cookies, or
 * `Object.prototype` of the page the user is signed into.
 *
 * A Web Worker is a separate realm with its own global object — a prototype
 * pollution primitive that reaches THIS scope's `Object.prototype` cannot
 * reach the main thread's, and this scope has no `document`, no
 * `localStorage`, no access to the Supabase client or auth session. It does
 * not patch the CVEs; it makes them land somewhere that has nothing worth
 * taking, which is what "sandbox `xlsx`" means when the library itself
 * cannot be fixed.
 *
 * Kept intentionally small and dependency-free apart from `xlsx` itself —
 * this file's whole job is to be the blast wall, not to also carry parsing
 * logic that then has to be trusted not to leak the raw workbook object
 * (which retains internal `xlsx` structures, not just plain data) back out.
 */
import * as XLSX from "xlsx";

export type XlsxWorkerRequest = { buf: ArrayBuffer };
// One flat shape rather than a discriminated union — `error` is "" on
// success, `rows` is [] on failure. The caller only ever needs one or the
// other, and this sidesteps relying on `.ok`-narrowing through a
// `MessageEvent.data` access, which is worth not depending on.
export type XlsxWorkerResponse = { error: string; rows: Record<string, unknown>[] };

self.onmessage = (e: MessageEvent<XlsxWorkerRequest>) => {
  const respond = (response: XlsxWorkerResponse) => (self as unknown as Worker).postMessage(response);
  try {
    const wb = XLSX.read(e.data.buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    // sheet_to_json's own output is plain data (strings/numbers/booleans) keyed
    // by header text — re-built into fresh plain objects before it leaves this
    // scope anyway, via JSON, so nothing carrying xlsx's internal cell-object
    // shape (or an object with a hostile own "__proto__" key surviving as
    // structured-clone data rather than a real prototype link) crosses over.
    const json = sheet
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
      : [];
    const rows = JSON.parse(JSON.stringify(json)) as Record<string, unknown>[];
    respond({ error: "", rows });
  } catch (err) {
    respond({ error: err instanceof Error ? err.message : String(err), rows: [] });
  }
};
