# BUG-001 — Migration Redesign (v2) Review

**New migration:** `supabase/migrations/20260908120000_bug001_link_recurring_to_income_stream_v2.sql`
**Supersedes:** `supabase/migrations/20260907190000_bug001_link_recurring_to_income_stream.sql` (neutralised to a no-op — body preserved in §8 of this doc)
**Companion query pack:** `qa/BUG-001-MIGRATION-IMPACT-V2.sql` (psql) · `qa/BUG-001-MIGRATION-IMPACT-V2-SUPABASE.sql` (web SQL Editor, `\echo` stripped — this is the one that was run)
**Prior audit:** `qa/BUG-001-PRE-MIGRATION-IMPACT.md` (v1 → RISK HIGH, DO NOT APPLY)
**Date:** 2026-09-08 (design + static review) · **live impact audit executed 2026-09-08, results in §9**
**Status of this work:** redesign + static review + live read-only impact audit. **Nothing was applied. The only live-DB activity was the read-only SELECTs in `qa/BUG-001-MIGRATION-IMPACT-V2-SUPABASE.sql`, run in the Supabase SQL Editor. No `db push`. No destructive SQL. No application-code change.**

> ### Gate status
> | | |
> |---|---|
> | OLD MIGRATION (`20260907190000`) | **DO NOT APPLY** — neutralised to a no-op; cannot execute its original destructive SQL |
> | V2 MIGRATION (`20260908120000`) | **READY FOR MIGRATION APPLY — NOT YET APPLIED** |
> | LIVE DATA IMPACT | **VERIFIED (2026-09-08)** — impact pack run read-only against `ludbntvhagefadfkhrjj`: v2 would link **0**, delete **0**, deactivate **0** records; 3 unmatched/inert recurring-income rows left untouched. Full results §9. |
> | PRODUCTION APPLY | **READY** — impact audit complete; apply is a human go/no-go decision, ideally in a maintenance window |
> | KNOWN HARD DELETE | **NONE** — v2 contains no `DELETE` and no `is_active` change (confirmed by inspection *and* by the live `would_delete = 0` / `would_deactivate = 0` results) |
> | AMBIGUOUS RECORDS | **PRESERVED** — 0 ambiguous rows live; the 3 unmatched rows are classified `C_unmatched_review` and never linked, deactivated or removed |
> | BUG-001 ITSELF | **NOT FIXED YET** — applying v2 adds the structural FK but does not clean the 3 existing orphan reminders (deferred manual step) and does not include the app-code follow-up |
>
> **Risk: LOW** — and now backed by executed live queries, not design inspection alone. On the current live data v2 is a pure additive-schema migration: its one `UPDATE` matches 0 rows.

---

## 1. What changed from v1

| | v1 (rejected) | v2 |
|---|---|---|
| Orphan handling | `DELETE FROM recurring_items …` — irreversible, predicate = "name matches no stream" | **No delete. No deactivation.** Orphans + ambiguous rows are *classified into `_backup.bug001_v2_review`* and left untouched for a human. |
| Backfill evidence | `tenant + name + amount` | `tenant + name + amount + currency + frequency + icon + active/passive flag + same user_id + created ≤180 s apart + strict 1:1 + no manual reminder row` |
| Manual RecurringDialog income | could be linked, then cascade-deleted | excluded by the reminder-row test and the full-fingerprint + temporal + 1:1 gate; if any signal is missing it falls to manual review, never a link |
| Snapshot | `CREATE TABLE IF NOT EXISTS _backup.recurring_items_bug001 AS …` (silent no-op on re-run) | `CREATE TABLE _backup.recurring_items_bug001_v2 AS …` (plain — a re-run aborts) **plus** `_backup.recurring_reminders_bug001_v2` **plus** row-count assertions |
| Verification | commented-out SELECTs | a `DO` block with 8 hard assertions; any failure rolls the whole migration back |
| Rollback | none written | explicit block; a one-line `UPDATE … SET income_stream_id = NULL` is a *complete* rollback because v2 deletes nothing |
| Re-runnable | unsafe (silent stale snapshot) | safe (aborts cleanly; single transaction → all-or-nothing) |

---

## 2. Schema & application facts this design rests on (verified in the repo)

| Fact | Source |
|---|---|
| `recurring_items` columns: `id, user_id (NOT NULL), tenant_id, type, name, category, subtype (nullable), amount (numeric), currency, fx_rate, frequency ∈ {monthly,weekly,yearly,one-time}, next_due_date, last_generated_at (nullable), icon (nullable), notes, is_active, created_at, updated_at`. **No `income_stream_id`, no `source`/`source_id`.** | `types.ts:1014`, migration `20260528093432`, live probe `400 42703` |
| `income_streams` columns: `id, tenant_id, user_id (nullable, ON DELETE SET NULL), name, type ∈ {active,passive}, icon (NOT NULL), amount numeric(14,2), currency, exchange_rate_to_inr, is_visible, display_order, frequency ∈ {monthly,weekly,one-time}, notes, created_at, updated_at`. **No link back to `recurring_items`.** | `types.ts:481`, migration `20260627120000` |
| `recurring_reminders.recurring_item_id → recurring_items.id ON DELETE CASCADE`, `UNIQUE (tenant_id, recurring_item_id)`. So `income_streams → recurring_items → recurring_reminders` is a two-hop cascade once v2's FK exists. | migration `20260806120000` |
| `transactions.source_recurring_id` is a **plain uuid, no FK** → deleting a recurring item never cascades to transactions; generated transactions survive. | migration `20260528093432:41`, `20260817120000` |
| **AddIncomeDialog** (`src/components/income/AddIncomeDialog.tsx:127-149`): `submit()` calls `onAdd(...)` (→ `useIncomeStreams.add` → `income_streams` insert, **not awaited, no `.select()`**, id never returned) then immediately `createRecurring.mutate(...)` (→ `recurring_items` insert). Both copy the **same** `name`, `amount` (raw, not FX-converted), `currency`, `frequency`, `icon`, and `type`/`subtype`. **No `recurring_reminders` row is created.** No transaction wraps the two writes. | file read |
| **RecurringDialog** (`src/components/recurring/RecurringDialog.tsx`, `type="income"`): inserts **only** a `recurring_items` row. Creates a `recurring_reminders` row **iff** the user toggles the reminder on. Never creates an `income_streams` row. | file read |
| `income_streams` / `recurring_items` deletes are **not audited** (plain `.delete()`, not an RPC). There is no historical record that a stream was ever deleted. | `useIncomeStreams.ts:233`, CLAUDE.md |
| Dashboard "Reminders" widget shows a recurring row **iff `is_active = true`** (`ActionableReminders.tsx:81`). `is_active = false` is the app's existing, reversible "hide from dashboard" mechanism. | file read |
| Interim frontend fix is live: `useIncomeStreams.remove()` deletes the twin by `(tenant, type='income', name, amount)` on stream delete — so **new** orphans have not accumulated since Stage 2. The orphan population is historical and bounded. | `useIncomeStreams.ts:246-255` |
| `user_id`: `recurring_items.user_id` is `NOT NULL` and set explicitly (`useCreateRecurring`); `income_streams.user_id` defaults to `auth.uid()` and is nulled if the creator is deleted. For a same-session twin they are equal. | migrations + hooks |

### Is the v1-proposed temporal rule (`< 10 s` + same `user_id`) reliable? (RULE 4)

**Partly — and v1's specific form is too tight.** The two inserts *are* fired together in one
`submit()` handler, so `created_at` proximity is real. But they are two independent HTTP POSTs,
each stamped with its own transaction's `now()`; the delta is normally sub-second to a few
seconds with **no guaranteed upper bound** (a slow network or a retried mutation stretches it).
A 10 s cutoff would silently drop legitimate twins (safe, but defeats the point).

v2's decision: use the temporal check as a **necessary, not sufficient** condition with a
**generous 180 s window**, and never rely on it alone — it only *rejects* far-apart matches. The
real protection against a wrong link is the **full-fingerprint match + strict 1:1 + no reminder
row**. `ri.user_id = s.user_id` (both non-null) is kept as a hard condition; a nulled stream
`user_id` sends that row to manual review.

---

## 3. RULE-by-RULE compliance

| Rule | How v2 complies |
|---|---|
| **1 — no hard delete** | v2 contains no `DELETE`, and no `UPDATE … is_active`. The only `UPDATE` is `SET income_stream_id = <confident stream>`. Orphans stay exactly as they are. If they must leave the dashboard, that is a later reviewed step using `is_active = false` (the app's own mechanism). |
| **2 — conservative backfill** | Match requires `tenant_id`, `name`, `amount`, `currency`, `frequency`, `icon`, `subtype`↔`type`, `user_id` (all equal, non-null) **and** `created_at` ≤ 180 s apart **and** strict 1:1 **and** no `recurring_reminders` row. Only evidence that exists in this schema is used. |
| **3 — manual recurring income independent** | A RecurringDialog row is caught by: (a) it usually has no matching stream at all → not linked; (b) if it coincidentally shares name+amount, it still has to match currency/frequency/icon/subtype/user *and* be within 180 s of the stream *and* be 1:1 — a manual entry made in a different session fails the temporal test; a duplicate made in the same session fails 1:1; (c) any manual reminder toggle → excluded outright. |
| **4 — temporal matching** | Investigated (§2). v1's `< 10 s` rejected as too tight and not reliable alone. v2 uses 180 s as one necessary signal among eight, never decisive by itself. |
| **5 — recurring_reminders** | Investigated (§2, §Q4 below). They cascade off `recurring_items`, which will cascade off `income_streams` after v2. v2 **snapshots them** (`_backup.recurring_reminders_bug001_v2`) and **excludes** any recurring row that has one from the backfill. Nothing cascade-related becomes unrecoverable. |
| **6 — backup** | Versioned names (`…_bug001_v2`), plain `CREATE TABLE` (re-run aborts), both `recurring_items` and `recurring_reminders` captured, `SELECT *` preserves `tenant_id`/`user_id`, row-count assertions in STEP 1 and STEP 6. |
| **7 — structure** | STEP 0 preflight → STEP 1 snapshot → STEP 2 schema/FK/index → STEP 3 identify confident → STEP 4 backfill confident only → STEP 5 classify the rest (no change) → STEP 6 verify. Matches the required shape. |
| **8 — ambiguous records** | `_backup.bug001_v2_review` labels every income recurring row `A_linked` / `B_ambiguous_review` / `C_unmatched_review` with all signal columns. B and C rows are **untouched**. `qa/BUG-001-MIGRATION-IMPACT-V2.sql` Q2/Q3/Q4 produce the same worklist read-only, pre-apply. |
| **9 — original bug behaviour** | Stream → twin reminder link established for confident twins; deleting the stream now cascades the twin (and its reminder row) away. Manual recurring income keeps `income_stream_id = NULL` and never cascades. |
| **10 — application code** | No app file touched. The `AddIncomeDialog` / `useIncomeStreams.remove()` follow-up is listed in the migration footer as *separate, later* work. |

---

## 4. Line-by-line review of the v2 migration

**STEP 0 (preflight `DO` block)** — aborts if `income_stream_id` already exists (prior BUG-001
migration ran) or if any of the three tables is missing. Read-only. Cannot damage anything. ✔

**STEP 1 (snapshots)** —
`CREATE SCHEMA IF NOT EXISTS _backup` — idempotent, safe. ✔
`CREATE TABLE _backup.recurring_items_bug001_v2 AS SELECT * …` — no `IF NOT EXISTS`; a second run
errors ("relation already exists") and, because the migration is one transaction, rolls back with
zero side effects. ✔
`_backup.recurring_reminders_bug001_v2` — same. Captures the cascade children v1 ignored. ✔
Count-assertion `DO` block — proves the snapshots are complete copies before any change. ✔
`COMMENT ON TABLE` ×2 — documentation only. ✔
*Note:* the `_backup` tables inherit default privileges and have no RLS. PostgREST only exposes
`public`, so they are not API-reachable, but they are unencrypted cross-tenant financial data —
**STEP 6 does not check `_backup` grants; run Q8 of the impact pack after applying**, and drop
the `_backup` tables once the fix is stable (footer instruction 4).

**STEP 2 (schema)** —
`ADD COLUMN IF NOT EXISTS income_stream_id uuid REFERENCES public.income_streams(id) ON DELETE CASCADE`
— additive, nullable, no default → existing rows get `NULL`, no rewrite lock of consequence on a
~dozens-of-rows table. FK direction correct (stream = parent). `IF NOT EXISTS` is harmless here
because STEP 0 already guaranteed the column is absent. ✔
`CREATE INDEX IF NOT EXISTS … (income_stream_id)` — supports the cascade and future lookups. Plain
(not `CONCURRENTLY`) so it stays inside the transaction. ✔
`COMMENT ON COLUMN` — documentation. ✔

**STEP 3 (`CREATE TABLE _backup.bug001_v2_confident AS …`)** — a `SELECT` into a `_backup` table.
Reads `recurring_items`, `income_streams`, `recurring_reminders`. Writes nothing in `public`.
The `pair` CTE is the full-fingerprint join; `counts` enforces strict 1:1 via window counts;
the final filter keeps only `streams_for_recurring = 1 AND recurrings_for_stream = 1`. Plain
`CREATE TABLE` → re-run aborts. ✔

**STEP 4 (`UPDATE public.recurring_items … SET income_stream_id = c.stream_id FROM _backup.bug001_v2_confident c WHERE ri.id = c.recurring_id`)**
— the only write to `public`. Touches exactly the rows in `bug001_v2_confident` (which is
`type='income'` only, 1:1, fingerprinted). Sets one previously-`NULL` column. No row is deleted,
no other column changes, no `is_active` change. Fully reversible with `SET income_stream_id = NULL`. ✔

**STEP 5 (`CREATE TABLE _backup.bug001_v2_review AS …`)** — `SELECT` into `_backup`. Classifies
every `type='income'` row. `A_linked` = got an `income_stream_id` in STEP 4; `C_unmatched_review`
= no stream shares the name; `B_ambiguous_review` = everything else. No `public` write. Stores
flags and timestamps, not `name`/`amount`/`notes`. ✔

**STEP 6 (verification `DO` block)** — 8 assertions, each `RAISE EXCEPTION` on violation →
transaction rollback:
1. linked count == confident-candidate count
2. no `type <> 'income'` row linked
3. every linked row's `income_stream_id` resolves to a real stream (FK also guarantees this)
4. no stream linked from >1 recurring row (1:1 holds post-write)
5. no linked row also has a `recurring_reminders` row
6. no linked pair spans two tenants
7. review table row count == income row count
8. (implicit) all wrapped so a raise rolls back STEPS 1–5 too
✔

**ROLLBACK / POST-APPLY comment block** — no executable SQL; guidance only. ✔

---

## 5. Ambiguity / manual-review worklist (RULE 8 deliverable)

Produced two ways, identical logic:

- **At apply time:** `_backup.bug001_v2_review` (persisted by STEP 5).
- **Pre-apply, read-only:** `qa/BUG-001-MIGRATION-IMPACT-V2.sql`
  - **Q1** — confident twins (what STEP 4 links; nothing else)
  - **Q2** — ambiguous: name matches a stream but the row is not a confident twin → untouched
  - **Q3** — unmatched: no stream shares the name → untouched (orphan *or* deliberate manual)
  - **Q4** — for Q2+Q3 rows: `has_reminder` / `has_generated_txn` / `last_generated_at` /
    `closest_stream_secs` → the signals a human uses to decide "dead orphan" vs "real manual entry"
  - **Q5** — per-tenant counts (`would_link_v2`, `ambiguous_review`, `unmatched_review`,
    `would_delete = 0`, `would_deactivate = 0`)

**Decision rule for the human, after Q3/Q4:**
- `has_reminder` OR `has_generated_txn` OR `last_generated_at IS NOT NULL` → **deliberate manual
  income. Leave it. Do not deactivate.**
- none of those, `is_active = true`, old `created_at`, name reads like a former stream → likely a
  pre-Stage-2 orphan → **`UPDATE … SET is_active = false`** (reversible) in a small follow-up.
- genuinely unsure → leave it; the dashboard showing one stale reminder is a lesser harm than
  deleting real data.

---

## 6. Required review — the 10 questions

| # | Question | Answer |
|---|---|---|
| 1 | Can any legitimate manual recurring income be **deleted**? | **No.** v2 has no `DELETE` and no `is_active` change. The worst v2 can do to a manual row is nothing. |
| 2 | Can a manual recurring income **accidentally become linked**? | **Only in one contrived case**, and it is bounded: the user creates a RecurringDialog income *in the same session, within 180 s* of an AddIncomeDialog stream that has an identical `name`, `amount`, `currency`, `frequency`, `icon` and `active/passive` flag, same user, with no reminder toggle, and with no other similar row (strict 1:1). A manual entry made in any *later* session fails the 180 s test; a same-session duplicate fails 1:1. If it did occur, the link is still reversible until the stream is deleted (`SET income_stream_id = NULL`), and the snapshot covers it after. Q1 of the impact pack lists every candidate with `secs_apart` for a human to eyeball before applying. |
| 3 | Can an income-stream deletion **unexpectedly remove manual data**? | Not via v2's linking (see #2). **Yes, via the pre-existing interim frontend fix** — `useIncomeStreams.remove()` still deletes any `recurring_items` row matching `(tenant, type='income', name, amount)`, which could hit a manual RecurringDialog row that shares name+amount with the deleted stream. That is a **v1-era risk that predates this migration** and RULE 10 forbids touching app code now. It is flagged for the follow-up: once v2 is applied and `AddIncomeDialog` sets `income_stream_id` at insert time, the interim name+amount delete should be **removed** (the CASCADE replaces it) — at which point this risk disappears. Documented in the migration footer and §7 below. |
| 4 | Can `recurring_reminders` be **lost**? | **Not by v2** (no delete anywhere; a recurring row with a reminder is excluded from linking). Going *forward*, deleting a stream cascades stream → twin → reminder — which is the intended behaviour for a real twin, and a twin never had a reminder row to begin with. Both `recurring_reminders` and `recurring_items` are snapshotted, so even a future mistaken stream deletion is recoverable by id. |
| 5 | Can the migration be **safely re-run**? | **Yes.** STEP 0 aborts if the column exists; the plain `CREATE TABLE` snapshots abort if they exist. The migration is one transaction, so any abort rolls back with no side effects. `supabase db push` also records applied migrations and will not re-run this file normally. |
| 6 | Can the migration **partially fail**? | **No lasting partial state.** Every statement runs in one transaction; a failure at any point (including a STEP 6 assertion) rolls back STEPS 1–5, the FK/column, and the `_backup` tables. The database is left exactly as before. The only non-transactional statement type (`CREATE INDEX CONCURRENTLY`) is deliberately **not** used. |
| 7 | Is **rollback** possible? | **Yes, and it is a one-liner while no stream has been deleted post-apply:** `UPDATE public.recurring_items SET income_stream_id = NULL;` then drop the column/index/`_backup` tables. Because v2 deletes nothing, there is no data to reconstruct. If a stream *was* deleted after apply, restore that stream's twin + its reminder row from the two snapshots by `id` first, then run the same block. The migration footer carries the exact script. |
| 8 | Does **RLS** affect any migration assumption? | **No.** Migrations run as the table owner / superuser, which bypasses RLS — so STEP 3's cross-tenant join and STEP 4's `UPDATE` see every tenant's rows. FK checks and `ON DELETE CASCADE` also run as owner and ignore RLS, so the cascade fires regardless of who deletes a stream or which policy would have filtered it. The new column needs no policy change (row policies govern the table; there is no column-level RLS here) and is covered by the existing table `GRANT`s. The `_backup` schema is outside PostgREST's exposed schema list, so RLS-less `_backup` tables are not API-reachable — but confirm no `anon`/`authenticated` grant leaked (impact pack Q8) and drop them after sign-off. |
| 9 | Does the migration work **across all tenants**? | **Yes.** All of STEP 3–6 are set-based over the whole table with `tenant_id` as a join key; there is no per-tenant loop and no tenant filter. STEP 6 assertion #6 proves no link crossed a tenant boundary. |
| 10 | Are there **ambiguous records that require manual review**? | **Yes, by design.** Every `type='income'` row that is not a confident twin is classified `B_ambiguous_review` or `C_unmatched_review` in `_backup.bug001_v2_review` and left untouched. The count is unknown from this environment (no DB access) — run `qa/BUG-001-MIGRATION-IMPACT-V2.sql` Q2/Q3/Q5 to get it. |

---

## 7. Residual risks & follow-ups (not fixed here, on purpose)

1. **Interim `useIncomeStreams.remove()` name+amount delete** (Q3 above) — still live, still able to
   delete a manual RecurringDialog row that collides on name+amount with a deleted stream. Remove
   it in the app-code follow-up once `income_stream_id` is set at insert time. RULE 10 keeps it
   out of scope now.
2. **`_backup` tables are unencrypted cross-tenant data** — acceptable short-term (not
   API-reachable), but drop them promptly after the fix is verified. Add to the ops checklist.
3. **Confident-match under-linking** — some genuine twins with an edited icon, a >180 s insert
   gap, a sub-paisa amount, or a nulled stream `user_id` will land in `B_ambiguous_review`
   instead of being auto-linked. That is the intended trade (safe). They get picked up by manual
   review or simply stay unlinked until the app-code fix makes new twins self-link.
4. **No PITR** — `Disaster_Recovery.md` §3.1 is still open. The snapshot is the only net. Because
   v2 is non-destructive this is far less acute than for v1, but enabling PITR before *any*
   production migration remains the right call.

---

## 8. Superseded v1 — original body (for the record)

The file `supabase/migrations/20260907190000_bug001_link_recurring_to_income_stream.sql` has been
replaced with a no-op notice. Its original content, as reviewed and rejected:

```sql
-- 0. snapshot
CREATE SCHEMA IF NOT EXISTS _backup;
CREATE TABLE IF NOT EXISTS _backup.recurring_items_bug001 AS
  SELECT * FROM public.recurring_items;

-- 1. the link
ALTER TABLE public.recurring_items
  ADD COLUMN IF NOT EXISTS income_stream_id uuid
  REFERENCES public.income_streams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recurring_items_income_stream_id
  ON public.recurring_items(income_stream_id);

-- 2. backfill existing pairs
WITH candidate AS (
  SELECT ri.id AS recurring_id,
         ( SELECT s.id FROM public.income_streams s
            WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name AND s.amount = ri.amount
            ORDER BY s.display_order, s.id LIMIT 1 ) AS stream_id
    FROM public.recurring_items ri
   WHERE ri.type = 'income' AND ri.income_stream_id IS NULL
)
UPDATE public.recurring_items ri
   SET income_stream_id = candidate.stream_id
  FROM candidate
 WHERE ri.id = candidate.recurring_id AND candidate.stream_id IS NOT NULL;

-- 3. delete the orphans
DELETE FROM public.recurring_items ri
 WHERE ri.type = 'income'
   AND ri.income_stream_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.income_streams s
      WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name
   );
```

Rejection reasons: see the header of the neutralised file and `qa/BUG-001-PRE-MIGRATION-IMPACT.md`.

---

## 9. Live impact audit — executed 2026-09-08

`qa/BUG-001-MIGRATION-IMPACT-V2-SUPABASE.sql` was run **read-only** against the live project
`ludbntvhagefadfkhrjj` in the Supabase SQL Editor. No other statement was run. Results:

| Query | Result | Meaning |
|---|---|---|
| **Q0** | `income_stream_id_exists = false` | migration not yet applied; column absent — v2's STEP 0 preflight will pass |
| **Q1** | **0 rows** | v2 STEP 3/4 would set `income_stream_id` on **0** recurring rows |
| **Q1b** | `confident_twins = 0` | — |
| **Q2** | **0 rows** | **0** ambiguous rows (name matches a stream but not a confident twin) |
| **Q3** | **3 rows** | 3 `type='income'` recurring rows with **no** income stream sharing their name |
| **Q4** | `unmatched_total = 3` · `unmatched_but_engaged_probably_manual = 0` · `unmatched_and_inert_possible_orphan = 3` | all 3 unmatched rows are **inert** — no reminder setting, no generated transaction, no `last_generated_at`. Consistent with pre-fix orphans; none shows the signals of an actively-used manual entry. |
| **Q5** | per tenant: `recurring_income_total = 3` · `would_link_v2 = 0` · `ambiguous_review = 0` · `unmatched_review = 3` · `would_delete = 0` · `would_deactivate = 0` | (recurring income spread across 2 tenants) |
| **Q6** | `tenants_total = 16` · `recurring_items_total = 3` · `recurring_income_total = 3` · **`income_streams_total = 0`** · `tenants_with_recurring_income = 2` | the `income_streams` table is **empty across all 16 tenants**. Every `recurring_items` row (3 total) is `type='income'`. |
| **Q7** | `reminders_total = 0` · `reminders_on_income_rows = 0` · `orphaned_reminder_rows = 0` | the `recurring_reminders` table is **empty**. Nothing can be cascade-lost. |

### What this means for applying v2 today

- **`income_streams` is empty**, so the confident-twin match has nothing to match against — Q1/Q1b/Q2 are 0 by necessity, not by luck. The backfill (STEP 3/4) is a no-op on current data; it future-proofs the schema for streams created after the app-code follow-up.
- Applied to the live database **as it stands now**, v2 is a **pure additive-schema migration**:
  - STEP 1 snapshots: `_backup.recurring_items_bug001_v2` = 3 rows, `_backup.recurring_reminders_bug001_v2` = 0 rows.
  - STEP 2: adds `income_stream_id` + FK + index (FK references an empty table).
  - STEP 3: `_backup.bug001_v2_confident` = 0 rows.
  - STEP 4: `UPDATE` matches **0 rows**.
  - STEP 5: `_backup.bug001_v2_review` = 3 rows, all `C_unmatched_review`.
  - STEP 6: all 8 assertions pass (0 == 0; review 3 == income 3; etc.).
- **The 3 unmatched recurring-income rows are NOT touched by v2** — not linked, not deactivated, not deleted. They remain visible on their 2 tenants' dashboards exactly as today. Clearing them is a separate, manual, reviewed step (per §5 / §7): because Q4 shows all 3 are inert, `UPDATE … SET is_active = false` (reversible) is the appropriate action once a human confirms each is a dead orphan and not an intentionally-dormant entry — **still never a `DELETE`**.
- The one theoretical wrong-link path (§6 question 2) **cannot occur on current data** — it needs an income stream, and there are none.

### Note recorded, not acted on

`income_streams_total = 0` while 2 tenants carry `type='income'` recurring items is itself worth a
product look: either those 3 rows were created via `RecurringDialog` (manual) and never had a
stream, or they are orphans from `AddIncomeDialog` twins whose streams were later deleted, or the
`income_streams` table was reset. The data cannot distinguish these. Out of scope for this
migration; flagged for the follow-up review of the 3 rows.

---

## 10. Final report — PRE-APPLY RECOMMENDATION

```
OLD MIGRATION (20260907190000):
DO NOT APPLY
  - neutralised to a no-op; body archived in §8; cannot execute its original SQL

V2 MIGRATION (20260908120000_..._v2):
READY FOR MIGRATION APPLY — NOT YET APPLIED
  - redesign + static review complete (this document)
  - live read-only impact audit COMPLETED SUCCESSFULLY 2026-09-08 (§9)
  - apply is a human go/no-go; a maintenance window + PITR-enabled is the ideal,
    though on current data the migration mutates 0 rows

LIVE IMPACT (verified 2026-09-08, read-only, project ludbntvhagefadfkhrjj):
  - V2 would LINK          0 records   (income_stream_id set on 0 rows)
  - V2 would DELETE        0 records
  - V2 would DEACTIVATE    0 records
  - unmatched / inert possible-orphan recurring-income records:  3
  - those 3 records remain UNTOUCHED by V2
  - income_streams rows currently in the database:      0
  - recurring_reminders rows currently in the database: 0
  - the live impact audit has been completed successfully

RISK: LOW
  - backed by executed live queries, not design inspection alone
  - on current data v2 is additive schema only: its single UPDATE matches 0 rows
  - no DELETE, no is_active change anywhere in the migration
  - single transaction (all-or-nothing); STEP 6 assertions abort on any anomaly
  - rollback: one-line UPDATE ... SET income_stream_id = NULL (nothing to
    reconstruct — 0 rows were changed), then drop column/index/_backup tables

DATA LOSS RISK: NO
  - by inspection: v2 has no intentional hard delete and no deactivation
  - by live audit: would_delete = 0, would_deactivate = 0, would_link = 0
  - the only theoretical wrong-link path needs an income stream to exist; there
    are 0, so it cannot occur on current data

AMBIGUOUS RECORDS: NONE LIVE
  - Q2 = 0. The 3 unmatched rows are classified C_unmatched_review and are never
    linked, deactivated or deleted by v2.

REQUIRES MANUAL REVIEW: YES (post-apply, separate from the migration)
  1. the 3 C_unmatched_review rows (in _backup.bug001_v2_review): confirm each is
     a dead orphan, then UPDATE ... SET is_active = false (reversible). Never DELETE.
  2. the app-code follow-up: set income_stream_id on the AddIncomeDialog insert,
     drop the interim name+amount twin-delete from useIncomeStreams.remove().
  3. regenerate src/integrations/supabase/types.ts from ludbntvhagefadfkhrjj.

BUG-001 STATUS: NOT FIXED YET
  - applying v2 installs the structural FK + ON DELETE CASCADE, so a FUTURE
    income-stream deletion will clean up its linked twin
  - it does NOT clear the 3 existing orphan reminders (manual step 1 above)
  - it does NOT include the application-code change (step 2 above)
  - BUG-001 is fixed only once the migration is applied, the 3 orphans are
    resolved, the app code is updated, and the add-stream -> delete-stream
    reproduction is re-tested clean
```

**Stop point:** redesign + static review + live read-only impact audit complete. Migration
**NOT applied**, no `db push`, no live-DB writes, no application-code change. V2 is **READY FOR
MIGRATION APPLY but NOT YET APPLIED** — the apply itself is a human decision.

### Apply attempt — 2026-09-08 — BLOCKED (no credentials)

A controlled apply was authorised and attempted. Pre-flight (Phase 1) passed on every check.
Phase 2 (apply) is **BLOCKED**: this environment has no `SUPABASE_ACCESS_TOKEN` (env unset,
`supabase` CLI not logged in), no database password, and no session-pooler host — all three are
required by [`docs/runbooks/apply-a-migration.md`](../docs/runbooks/apply-a-migration.md). Per
instruction, credentials were **not** requested in chat. `supabase db push` and
`supabase gen types` cannot run from here.

**To apply** (operator with the three credentials, from `F:\Movie\AK\FinRoot\_extracted`):
```powershell
$env:SUPABASE_ACCESS_TOKEN = '<sbp_ token>'
$sb  = 'F:\Movie\AK\FinRoot\.tools\supabase\supabase.exe'
$pw  = [System.Web.HttpUtility]::UrlEncode('<db-password>')
$url = "postgresql://postgres.ludbntvhagefadfkhrjj:$pw@<pooler-host>:5432/postgres"
'y' | & $sb db push --db-url $url --workdir 'F:\Movie\AK\FinRoot\_extracted'
& $sb gen types typescript --project-id ludbntvhagefadfkhrjj > src/integrations/supabase/types.ts  # strip BOM/CRLF
```
Then run Phase 3 verification (below) + Q8 of `qa/BUG-001-MIGRATION-IMPACT-V2-SUPABASE.sql`.
Expected on current data: `income_stream_id` column + FK + index created; `_backup.*` tables
created (`recurring_items_bug001_v2` = 3 rows, `recurring_reminders_bug001_v2` = 0,
`bug001_v2_confident` = 0, `bug001_v2_review` = 3); **0 rows linked, 0 deleted, 0 deactivated**;
STEP 6 `RAISE NOTICE 'BUG-001 v2 verified: 0 rows linked, 0 anomalies. 3 income rows classified'`.

**Phase 3 verification queries** (read-only, after apply):
```sql
-- 1 column exists + type
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='recurring_items' AND column_name='income_stream_id';
-- 2/3 FK + ON DELETE CASCADE
SELECT tc.constraint_name, rc.delete_rule, ccu.table_name AS refs
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
 WHERE tc.table_name='recurring_items' AND tc.constraint_type='FOREIGN KEY'
   AND tc.constraint_name LIKE '%income_stream_id%';   -- expect delete_rule = CASCADE, refs = income_streams
-- 4 index
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='recurring_items' AND indexname='idx_recurring_items_income_stream_id';
-- 5/6 backup tables + counts
SELECT 'recurring_items_bug001_v2' t, count(*) FROM _backup.recurring_items_bug001_v2
UNION ALL SELECT 'recurring_reminders_bug001_v2', count(*) FROM _backup.recurring_reminders_bug001_v2
UNION ALL SELECT 'bug001_v2_confident', count(*) FROM _backup.bug001_v2_confident
UNION ALL SELECT 'bug001_v2_review', count(*) FROM _backup.bug001_v2_review;
-- 7 nothing unexpectedly changed: live == snapshot, whole-row
SELECT count(*) AS changed_rows FROM (
  SELECT id,tenant_id,user_id,type,name,category,subtype,amount,currency,fx_rate,frequency,
         next_due_date,last_generated_at,icon,notes,is_active,created_at FROM public.recurring_items
  EXCEPT
  SELECT id,tenant_id,user_id,type,name,category,subtype,amount,currency,fx_rate,frequency,
         next_due_date,last_generated_at,icon,notes,is_active,created_at FROM _backup.recurring_items_bug001_v2
) d;   -- expect 0  (income_stream_id excluded on purpose — it is the one new column)
-- 8 no recurring_items deleted
SELECT (SELECT count(*) FROM _backup.recurring_items_bug001_v2)
     - (SELECT count(*) FROM public.recurring_items) AS recurring_items_lost;   -- expect 0
-- 9 no recurring_reminders deleted
SELECT (SELECT count(*) FROM _backup.recurring_reminders_bug001_v2)
     - (SELECT count(*) FROM public.recurring_reminders) AS recurring_reminders_lost;   -- expect 0
-- 10 rows linked / deactivated
SELECT count(*) FILTER (WHERE income_stream_id IS NOT NULL) AS rows_linked,
       count(*) FILTER (WHERE type='income' AND is_active = false) AS income_rows_inactive
  FROM public.recurring_items;
```
