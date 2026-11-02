import type { XlsxWorkerRequest, XlsxWorkerResponse } from "./xlsxWorker";
import { gridToObjects } from "./sheetRows";

/**
 * Main-thread side of the BUG-032 xlsx sandbox — see xlsxWorker.ts for why
 * this exists. One worker per call, not a pool: imports are an infrequent,
 * user-initiated action, not a hot path, and a fresh worker per file means
 * no state (or a wedged worker from a previous malformed file) can carry
 * over between imports.
 */

// A real bank/broker export is a few hundred KB to a few MB. 25 MB is
// generous headroom for that while still bounding how much memory a single
// hostile upload can force the worker to hold before parsing even starts.
const MAX_XLSX_BYTES = 25 * 1024 * 1024;

/**
 * The rows of every sheet in a workbook, each read under its own header row
 * — found by [known] column names when given (see sheetRows.ts), so a header
 * sitting below a block of account details is still found.
 */
export async function parseXlsxSandboxed(
  buf: ArrayBuffer,
  known?: ReadonlySet<string>,
): Promise<Record<string, unknown>[]> {
  if (buf.byteLength > MAX_XLSX_BYTES) {
    throw new Error(
      `File is too large to import (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB, limit 25 MB).`,
    );
  }

  const worker = new Worker(new URL("./xlsxWorker.ts", import.meta.url), { type: "module" });
  try {
    const sheets = await new Promise<unknown[][][]>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<XlsxWorkerResponse>) => {
        const { error, sheets } = e.data;
        if (error) reject(new Error(error));
        else resolve(sheets);
      };
      worker.onerror = (e) => reject(new Error(e.message || "Could not read that file."));
      const request: XlsxWorkerRequest = { buf };
      worker.postMessage(request, [buf]);
    });
    return sheets.flatMap((grid) => gridToObjects(grid, known));
  } finally {
    worker.terminate();
  }
}
