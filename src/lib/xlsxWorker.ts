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
// success, `sheets` is [] on failure. The caller only ever needs one or the
// other, and this sidesteps relying on `.ok`-narrowing through a
// `MessageEvent.data` access, which is worth not depending on.
export type XlsxWorkerResponse = { error: string; sheets: unknown[][][] };

self.onmessage = (e: MessageEvent<XlsxWorkerRequest>) => {
  const respond = (response: XlsxWorkerResponse) => (self as unknown as Worker).postMessage(response);
  try {
    const wb = XLSX.read(e.data.buf, { type: "array" });
    // Every sheet as a plain grid of cell values (header: 1), not objects
    // keyed by row 1: a broker export's real header is often many rows down
    // (sheetRows.ts finds it). raw: true keeps a date cell as its Excel serial
    // number — formatted text would be "4/15/24", month first — and
    // normaliseDate turns the serial into yyyy-mm-dd exactly. Re-built through
    // JSON so nothing carrying xlsx's internal shapes leaves this scope.
    const grids = wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name];
      return sheet
        ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: false })
        : [];
    });
    const sheets = JSON.parse(JSON.stringify(grids)) as unknown[][][];
    respond({ error: "", sheets });
  } catch (err) {
    respond({ error: err instanceof Error ? err.message : String(err), sheets: [] });
  }
};
