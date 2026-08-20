/**
 * Twin declaration file for storage-purge.mjs (BUG-086), so
 * `storagePurge.test.ts` can import its pure functions under strict mode
 * (BUG-055) without an implicit `any`. Only what the test imports is
 * declared; the network half has no caller from `src/` and stays untyped.
 */
export function isTenantPrefix(prefix: unknown): boolean;
export function outsidePrefix(paths: unknown[], prefix: string): unknown[];
export function joinPrefix(prefix: string, name: string): string;
export function chunk<T>(items: T[], size: number): T[][];
export function isFileEntry(entry: { name?: unknown; id?: unknown } | null | undefined): boolean;
export function describeRow(row: {
  bucket_id: string;
  path_prefix: string;
  object_count: number | null;
  requested_at: string | null;
  last_error: string | null;
}): string;
