# Runbook — applying a migration

**Two migrations are written and NOT applied** (`20260811120000_stage5_legal_acceptance.sql`,
`20260811130000_stage5_account_deletion.sql`). Applying them is exactly this procedure. They are
listed in [CLAUDE.md](../../CLAUDE.md) because "written but not applied" is a state the code has to
be honest about, not a footnote.

**You need:** a Supabase personal access token, the database password, and the project's session
pooler hostname. See [rotate-credentials.md](rotate-credentials.md) for where each lives.

---

## 0. Before you write it

- **Never edit a migration that has been applied.** Add a new timestamped file. There are no down
  scripts, and `db push` records what it has run — editing an applied file means the database and
  the repository disagree forever.
- Name it `YYYYMMDDHHMMSS_stage<N>_<what>.sql`, and put the reasoning in a comment block at the top.
  The migrations in this repo carry their own arguments; that is deliberate, and it is why decisions
  from months ago can still be checked.
- If it changes a policy, work out the answer for **every** role first: owner, admin, viewer,
  platform admin, anon. The owner short-circuit in `get_effective_menus()`
  ([ADR-0002](../adr/0002-menus-are-a-real-paywall.md)) has surprised people before.

## 1. Read it once more, out loud

The database is shared and has **no backups** ([Disaster_Recovery.md](../Disaster_Recovery.md)).
`DROP`, `DELETE`, `UPDATE` without a `WHERE`, and any `ALTER … TYPE` on a populated column are the
statements to stop at. If one is genuinely needed, take a manual copy of the affected table first:

```sql
CREATE TABLE _backup_<table>_<yyyymmdd> AS SELECT * FROM public.<table>;
```

## 2. Apply

```powershell
$env:SUPABASE_ACCESS_TOKEN = '<token>'
$sb   = 'F:\Movie\AK\FinRoot\.tools\supabase\supabase.exe'
$root = 'F:\Movie\AK\FinRoot\_extracted'
$pw   = [System.Web.HttpUtility]::UrlEncode('<db-password>')   # & becomes %26
$url  = "postgresql://postgres.<ref>:$pw@<pooler-host>:5432/postgres"

'y' | & $sb db push --db-url $url --workdir $root
```

Three things that are not obvious and cost an hour each when forgotten:

- **Use the session pooler host, port 5432.** `db.<ref>.supabase.co` has no IPv4 record on the free
  tier and will not resolve. The `aws-N` prefix varies per project — take it from
  Dashboard → Project Settings → Database → Connection pooling. Port 6543 is transaction mode and
  cannot run all DDL.
- **URL-encode the password.** An `&` silently truncates the connection string.
- **Pass `--workdir`.** Without it the CLI looks for `supabase/` relative to the current directory.

`db push` is safe to re-run: migrations already recorded as applied are skipped. For a brand-new,
empty project use `scripts/bootstrap-supabase.ps1`, which does all of the above plus types.

## 3. Regenerate the types

```powershell
& $sb gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```

`--local` and `--db-url` need Docker; `--project-id` needs the access token. **Then check the file
for a BOM and CRLFs** — PowerShell's redirection has added both before, and the diff is enormous and
unreadable when it does. `src/integrations/supabase/types.ts` is generated: never hand-edit it.

## 4. Delete the temporary casts

Code written against a not-yet-existing function carries a cast to get past the generated types —
`legalAcceptance.ts` has one, with a comment saying to remove it after the regen. Search for it and
remove it, or the next person will assume the cast is load-bearing.

## 5. Verify as a real user, not as the service role

The service role bypasses RLS, so a check that runs as service role proves nothing about access.

```bash
# create a throwaway user via the admin API, get a user JWT:
curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
     -H 'content-type: application/json' -d '{"email":"…","password":"…"}'

# then hit PostgREST with apikey=<anon> AND Authorization: Bearer <user jwt>
```

Assert the thing the migration was for **and** the thing it must not have broken: a non-member gets
zero rows, a viewer cannot write, a plan-gated table stays gated. Delete the throwaway user and any
tenant it created afterwards (tenant first — `created_by` references the user).

## 6. Update the record

`npm run typecheck && npm test && npm run build`, then update
[Improvement_Roadmap.md](../Improvement_Roadmap.md) and the pending-migration note in
[CLAUDE.md](../../CLAUDE.md). A migration that is applied but still listed as pending is worse than
one that is neither.
