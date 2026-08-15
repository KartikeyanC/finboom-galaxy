/**
 * BUG-086 — drain the storage purge queue.
 *
 * Postgres cannot delete storage objects (`storage.protect_delete`), so
 * `purge_tenant_storage()` only ENQUEUES a workspace's prefix and the files
 * outlive the workspace. Every row in `storage_purge_queue` with
 * `completed_at IS NULL` is a set of documents belonging to a deleted account
 * that still exists. That is the gap this closes.
 *
 * Usage — needs a SERVICE ROLE key, which must never be a `VITE_` variable and
 * must never be committed (see docs/runbooks/rotate-credentials.md):
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/storage-purge.mjs            # dry run: lists, deletes nothing
 *
 *   ... node scripts/storage-purge.mjs --apply   # actually deletes
 *
 * 🔴 **Dry run is the default and `--apply` is the only way to delete.** This
 * script's entire job is irreversible deletion of other people's documents, so
 * the safe mode is the one you get by forgetting a flag.
 *
 * The pure helpers below are exported and tested in `src/lib/storagePurge.test.ts`;
 * the network half is deliberately thin.
 */

import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A queue row's `path_prefix` must be exactly `<tenant-uuid>/`.
 *
 * 🔴 This is the blast-radius check. The prefix is what everything else is
 * measured against, so if it were ever empty, `/`, or a bare bucket name, the
 * "inside the prefix" test below would pass for every object in the bucket and
 * the drain would delete every live workspace's documents.
 */
export function isTenantPrefix(prefix) {
  if (typeof prefix !== "string" || !prefix.endsWith("/")) return false;
  const body = prefix.slice(0, -1);
  return UUID.test(body);
}

/**
 * Every path must sit under the prefix. Returns the offenders, so a refusal can
 * say which object it was unwilling to touch rather than just declining.
 */
export function outsidePrefix(paths, prefix) {
  if (!isTenantPrefix(prefix)) return [...paths];
  return paths.filter(
    (p) => typeof p !== "string" || !p.startsWith(prefix) || p.includes("..") || p.length === prefix.length,
  );
}

/** `"abc/"` + `"policy/file.pdf"` → `"abc/policy/file.pdf"`, no double slash. */
export function joinPrefix(prefix, name) {
  const left = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const right = name.startsWith("/") ? name.slice(1) : name;
  return `${left}/${right}`;
}

export function chunk(items, size) {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * A Storage `list` response entry is a FILE when it carries an id; a folder is
 * reported with `id: null` and has to be descended into. Getting this backwards
 * means either deleting nothing or trying to delete directory names.
 */
export function isFileEntry(entry) {
  return Boolean(entry && typeof entry.name === "string" && entry.id !== null && entry.id !== undefined);
}

/** One line per queue row, for a human deciding whether to pass --apply. */
export function describeRow(row) {
  const age = row.requested_at ? ` requested ${row.requested_at}` : "";
  const err = row.last_error ? ` — last error: ${row.last_error}` : "";
  return `${row.bucket_id}/${row.path_prefix} (${row.object_count ?? "?"} objects at queue time)${age}${err}`;
}

// ---------------------------------------------------------------------------
// Network half
// ---------------------------------------------------------------------------

const PAGE = 100;
const DELETE_BATCH = 100;

function headers(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function listFolder(base, key, bucket, prefix) {
  const found = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`list ${prefix}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    found.push(...page);
    if (page.length < PAGE) break;
  }
  return found;
}

/** Depth-first walk, because objects are `<tenant>/<policy>/<file>`. */
async function listAllObjects(base, key, bucket, prefix) {
  const out = [];
  const entries = await listFolder(base, key, bucket, prefix);
  for (const entry of entries) {
    const full = joinPrefix(prefix, entry.name);
    if (isFileEntry(entry)) out.push(full);
    else out.push(...(await listAllObjects(base, key, bucket, `${full}/`)));
  }
  return out;
}

async function deleteObjects(base, key, bucket, paths) {
  for (const batch of chunk(paths, DELETE_BATCH)) {
    const res = await fetch(`${base}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: headers(key),
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) throw new Error(`delete: ${res.status} ${await res.text()}`);
  }
}

async function rpc(base, key, fn, args = {}) {
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const apply = process.argv.includes("--apply");

  if (!base || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Never use a VITE_ variable for the service role key.");
    process.exit(2);
  }

  const rows = await rpc(base, key, "po_pending_storage_purges");
  if (!rows?.length) {
    console.log("Nothing pending. Every purged workspace's files have been removed.");
    return;
  }

  console.log(`${rows.length} pending purge(s)${apply ? "" : " — DRY RUN, nothing will be deleted"}:\n`);
  let failures = 0;

  for (const row of rows) {
    console.log(`• ${describeRow(row)}`);

    if (!isTenantPrefix(row.path_prefix)) {
      console.error(`  REFUSED: "${row.path_prefix}" is not a <tenant-uuid>/ prefix. Not touching it.`);
      failures++;
      continue;
    }

    try {
      const paths = await listAllObjects(base, key, row.bucket_id, row.path_prefix);
      const strays = outsidePrefix(paths, row.path_prefix);
      if (strays.length) {
        throw new Error(`listing returned ${strays.length} path(s) outside the prefix, e.g. ${strays[0]}`);
      }

      if (!paths.length) {
        console.log("  no objects left — marking complete");
        if (apply) await rpc(base, key, "complete_storage_purge", { p_id: row.id });
        continue;
      }

      console.log(`  ${paths.length} object(s)${apply ? "" : " that WOULD be deleted"}:`);
      for (const p of paths.slice(0, 5)) console.log(`    ${p}`);
      if (paths.length > 5) console.log(`    … and ${paths.length - 5} more`);

      if (apply) {
        await deleteObjects(base, key, row.bucket_id, paths);
        const left = await listAllObjects(base, key, row.bucket_id, row.path_prefix);
        if (left.length) throw new Error(`${left.length} object(s) survived the delete`);
        await rpc(base, key, "complete_storage_purge", { p_id: row.id });
        console.log("  deleted and marked complete");
      }
    } catch (err) {
      failures++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${message}`);
      // Record the reason on the row so the next operator does not start blind.
      // complete_storage_purge with an error leaves completed_at NULL.
      if (apply) {
        try {
          await rpc(base, key, "complete_storage_purge", { p_id: row.id, p_error: message.slice(0, 500) });
        } catch {
          /* reporting the failure must not mask it */
        }
      }
    }
  }

  if (!apply) console.log("\nDry run. Re-run with --apply to delete.");
  if (failures) process.exit(1);
}

// Only run when invoked directly, so the helpers above can be imported by
// tests. `pathToFileURL` rather than string-building a file:// URL: on Windows
// `new URL("file://F:/...")` reads the drive letter as a HOST and the guard
// silently never matches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    // The likeliest first-run mistake, and a stack trace does not say it.
    if (/\b401\b|Invalid API key/i.test(message)) {
      console.error(
        "\nThat key was rejected. This needs the SERVICE ROLE key (Project Settings → API),\n" +
          "not the anon/publishable key — the queue and the Storage delete are both admin-only.",
      );
    }
    process.exitCode = 1;
  });
}
