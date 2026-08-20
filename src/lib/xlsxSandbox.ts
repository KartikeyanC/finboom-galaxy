import type { XlsxWorkerRequest, XlsxWorkerResponse } from "./xlsxWorker";

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

export async function parseXlsxSandboxed(buf: ArrayBuffer): Promise<Record<string, unknown>[]> {
  if (buf.byteLength > MAX_XLSX_BYTES) {
    throw new Error(
      `File is too large to import (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB, limit 25 MB).`,
    );
  }

  const worker = new Worker(new URL("./xlsxWorker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<XlsxWorkerResponse>) => {
        const { error, rows } = e.data;
        if (error) reject(new Error(error));
        else resolve(rows);
      };
      worker.onerror = (e) => reject(new Error(e.message || "Could not read that file."));
      const request: XlsxWorkerRequest = { buf };
      worker.postMessage(request, [buf]);
    });
  } finally {
    worker.terminate();
  }
}
