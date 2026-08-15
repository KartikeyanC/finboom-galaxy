# Coding Standards

> Documents the conventions the codebase **already follows** (so they are preserved), and the
> rules that must start being enforced. Derived from reading all 199 files in `src/`,
> 32 migrations and 5 edge functions on 2026-08-04.
> ⚠️ marks a rule the codebase currently violates.

---

## 1. Non-negotiables (inherited from `CLAUDE.md`, still correct)

1. **Never edit an existing migration.** Add a new timestamped file in `supabase/migrations/`.
2. **Never hand-edit generated files** — `src/integrations/supabase/client.ts` and `types.ts`.
   Regenerate with `supabase gen types typescript --project-id <ref>`.
   ⚠️ *`types.ts` is currently four migrations stale (BUG-015).*
3. **Security is server-side.** RLS is the gate; UI checks are convenience.
   ⚠️ *Menu/plan gating currently exists only in the UI (BUG-021).*
4. **The Product Owner reads aggregates only**, via `SECURITY DEFINER` RPCs. ✔ upheld.
5. **No new paid services** without approval; stay on free tiers.
   *Exception recommended by this audit: Supabase Pro for PITR — data loss is not a cost saving.*
6. **YAGNI.** Build what the current stage needs.

---

## 2. TypeScript

### Current settings — must change
```jsonc
// tsconfig.app.json  (today)
"strict": false, "noImplicitAny": false, "noUnusedLocals": false, "noUnusedParameters": false
// tsconfig.json
"strictNullChecks": false
```
For an application that does arithmetic on money, disabling `strictNullChecks` removes the
compiler's ability to catch the exact class of bug that produces a wrong number.

**Target** — enable incrementally, one flag per PR, fixing as you go:
`noUnusedLocals` → `noImplicitAny` → `strictNullChecks` → `strict`.

### Rules
- ⚠️ **`tsc` must exit 0.** SWC does not type-check, so the build passing means nothing.
  Add `npx tsc -p tsconfig.app.json --noEmit` to CI. *(Currently exit 2 — BUG-014.)*
- **No `any`.** Use `unknown` + a narrowing guard. *(11 ESLint errors today — BUG-054.)*
- **`as unknown as X` is a code smell that needs a comment and a ticket.** The codebase uses it
  for jsonb columns and, worse, for a whole client:
  ```ts
  // hooks/useIncomeStreams.ts:17 — remove once types.ts includes income_streams
  const db = supabase as unknown as SupabaseClient;
  ```
  Prefer regenerating types over casting.
- Export prop types alongside components; derive row types from `Tables<"name">` rather than
  hand-writing interfaces that can drift.
- Discriminated unions over optional-field soup.

---

## 3. Project structure

```
src/
  pages/                  route components, one per route
  components/<feature>/   feature components
  components/ui/          shadcn primitives — do not fork; add new files instead
  components/brand/       logo, branding, background
  hooks/                  data hooks (React Query + Supabase)
  contexts/               cross-cutting providers only
  lib/                    pure helpers and domain logic
  integrations/supabase/  GENERATED — never edit
supabase/
  migrations/             append-only
  functions/<name>/       edge functions
```

**Rules**
- ⚠️ **No file over ~400 lines / ~15 kB.** Nine files exceed 30 kB today; `Landing.tsx` is
  71 kB. Extract sub-components into a sibling directory.
- One component per file; co-locate its small private sub-components at the bottom.
- Shared logic goes to `lib/` only when a second consumer appears.
- ⚠️ **Delete dead code.** `PermissionsCenter.tsx` (21 kB) and `FeatureShowcase.tsx` (13 kB)
  are imported nowhere.

---

## 4. Naming

| Thing | Convention | Example |
|---|---|---|
| Components / files | PascalCase | `TransactionDialog.tsx` |
| Hooks | `use` + camelCase | `useLiveAccountBalances.ts` |
| Helpers / stores | camelCase | `chartColors.ts`, `tripsStore.ts` |
| DB tables/columns | snake_case, plural tables | `tracked_subscriptions.renewal_date` |
| RPCs | snake_case verb-first; `po_` prefix for PO-only | `get_effective_menus`, `po_assign_plan` |
| RLS policies | `<abbrev>_<action>` | `tx_select`, `accounts_insert` |
| Migrations | `YYYYMMDDHHMMSS_snake_description.sql` | `20260627120000_phase2j_income_streams.sql` |
| localStorage keys | `finroot.<domain>.<detail>` | `finroot.pin.<uid>` |
| Query keys | `[entity, ...discriminators, userId]` | `["transactions","expense",user.id]` |
| Menu ids | kebab-case, canonical in `lib/accessMenus.ts` | `bill-scan`, `net-worth` |

⚠️ Legacy keys that do not follow the prefix rule and should be migrated:
`valar.profiles`, `valar.income.streams`, `expense.custom-subcategories.v1`,
`subscriptions.records.v1`.

---

## 5. Data access

**Every new module uses a React Query hook. Do not add a new `lib/*Store.ts`.**

```ts
export function useThings() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();          // ← REQUIRED (BUG-002)
  return useQuery({
    queryKey: ["things", currentTenantId],
    enabled: !!user && !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("things")
        .select("id, name, amount, occurred_at")     // explicit columns, never "*"
        .eq("tenant_id", currentTenantId)            // ← REQUIRED
        .order("occurred_at", { ascending: false })
        .range(0, 49);                               // ← paginate
      if (error) throw error;
      return data;
    },
  });
}
```

**Rules**
1. ⚠️ **Always pass and filter `tenant_id` explicitly.** Never rely on
   `current_tenant_id()` — it returns the user's *first* workspace, not the selected one.
2. ⚠️ **Never `select("*")` on a table with large columns** (`insurance.document_data_url`,
   `subscriptions.raw`).
3. ⚠️ **Always bound a query** with `range()` or a date window.
4. Invalidate precisely: `qc.invalidateQueries({ queryKey: ["things"] })`.
5. ⚠️ **Never surface a raw error to the user** — route through a shared `toUserMessage()`
   mapper and log the original.
6. Multi-step writes belong in a single `SECURITY DEFINER` RPC so Postgres gives you the
   transaction.

---

## 6. SQL & migrations

**Template**
```sql
-- =============================================================================
-- <Phase / purpose> — one-paragraph explanation of intent.
-- =============================================================================
CREATE TABLE public.<name> (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  -- domain columns; money is ALWAYS numeric(14,2)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_<name>_tenant ON public.<name>(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.<name> TO authenticated;
GRANT ALL ON public.<name> TO service_role;

CREATE POLICY <n>_select ON public.<name> FOR SELECT USING (public.is_tenant_member(tenant_id,'viewer'));
CREATE POLICY <n>_insert ON public.<name> FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id,'admin'));
CREATE POLICY <n>_update ON public.<name> FOR UPDATE USING (public.is_tenant_member(tenant_id,'admin')) WITH CHECK (public.is_tenant_member(tenant_id,'admin'));
CREATE POLICY <n>_delete ON public.<name> FOR DELETE USING (public.is_tenant_member(tenant_id,'admin'));

CREATE TRIGGER trg_<n>_updated BEFORE UPDATE ON public.<name>
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**Rules**
1. ⚠️ **Every `CREATE FUNCTION` must be followed by an explicit grant policy.** Postgres grants
   `EXECUTE` to `PUBLIC` by default:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.fn(args) FROM PUBLIC, anon, authenticated;
   GRANT  EXECUTE ON FUNCTION public.fn(args) TO authenticated;  -- only if end-users call it
   ```
   *(Four functions currently lack this — BUG-003/004.)*
2. Every `SECURITY DEFINER` function sets `search_path` (`SET search_path = public`) — ✔ the
   codebase does this consistently.
3. Every privileged RPC starts with its guard and ends with `log_audit()`.
4. Money is `numeric`, never `float` / `real` / `double`.
5. Enumerations use `CHECK (col IN (...))` — **and the TypeScript union must be updated in the
   same PR.** *(`trips.kind` drifted — BUG-009.)*
6. Adding a column to a large table: `ADD COLUMN` nullable → backfill in batches → `SET NOT NULL`
   with `NOT VALID` + `VALIDATE`, and a `lock_timeout`.
7. Prefer Supabase Storage over base64 in a `text` column.
8. Keep a matching down/rollback note in the migration header, even though Supabase does not run
   down migrations.

---

## 7. React & UI

- Function components + hooks only. No classes (except the error boundary, which requires one).
- ⚠️ **An `ErrorBoundary` must wrap the router.**
- Hook order: context → data → derived `useMemo` → callbacks → effects.
- ⚠️ `react-hooks/exhaustive-deps` is a **warning** today with 27 instances in `lib/*Store.ts`.
  Treat it as an error for new code.
- Styling: Tailwind utilities + semantic tokens (`bg-card`, `text-muted-foreground`). Never a
  raw hex in a component when a token exists.
- ⚠️ Watch for double spaces in class strings — Tailwind's JIT scanner can mis-parse them.
- Use `MoneyInput` for every money field except FX rates, day counts, percentages and the
  calculator.
- Chart colours come from `lib/chartColors.ts::chartColor(i, dark)`; donut active shapes from
  `lib/chartShapes.tsx`. Do not define a local palette.
- `dangerouslySetInnerHTML` requires a comment justifying why the input is not user-controlled.
- Every page needs loading, empty and error states.
- Every interactive element needs an accessible name; custom controls need a role and a
  keyboard path.

---

## 8. Edge functions

```ts
const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, /* not "*" */ };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // 1. authenticate (JWT or HMAC)
  // 2. authorize
  // 3. rate-limit
  // 4. validate input against a schema
  // 5. act
  // 6. return a typed JSON response with a correct status code
});
```

**Rules**
1. Never accept a caller-supplied recipient, URL or destination without an allow-list.
2. Never return a differential response that reveals whether an account exists.
3. Compare secrets and HMACs in constant time.
4. Validate webhook timestamps and de-duplicate by event id.
5. `verify_jwt = false` must be justified in a comment and paired with rate limiting.
6. Return real status codes — never 200 on failure.
7. Log with enough context to debug, and never log secrets or PII.

---

## 9. Testing

- New `lib/` code ships with unit tests. New RPCs and policies ship with integration tests.
- Every fixed bug gets a regression test **named after the bug id**.
- Every security fix gets a **negative** test that attempts the exploit and asserts failure.
- Coverage floor once CI exists: `src/lib` and `src/hooks` ≥ 70 %.

---

## 10. Git & review

- Branch per change; no direct pushes to the default branch.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `perf:`, `test:`.
- ⚠️ **This project is not currently a git repository.** Initialise one before further work —
  there is no history, no blame and no revert today.

**Review checklist**
- [ ] `tsc` exits 0 and ESLint is clean
- [ ] `tenant_id` is passed on writes and filtered on reads
- [ ] New functions have explicit `REVOKE`/`GRANT`
- [ ] Privileged RPCs guard **and** audit
- [ ] No `select("*")`; queries are bounded
- [ ] Errors are mapped, not raw
- [ ] Loading / empty / error states exist
- [ ] Money uses `numeric` and `MoneyInput`
- [ ] TS unions match DB CHECK constraints
- [ ] Tests added; a regression test for any bug fix
- [ ] `types.ts` regenerated if a migration was added

---

## 11. Documentation duties

| When | Update |
|---|---|
| New table or RPC | [Database_Architecture.md](./Database_Architecture.md), [API_Documentation.md](./API_Documentation.md) |
| New business rule | [Business_Rules.md](./Business_Rules.md) |
| Bug found | [BUG_TRACKER.md](./BUG_TRACKER.md) |
| Test executed | [QA_PROGRESS.md](./QA_PROGRESS.md) |
| Milestone closed | [Production_Readiness.md](./Production_Readiness.md) |
| Architectural decision | an ADR + [Architecture.md](./Architecture.md) |

⚠️ `CLAUDE.md` currently states the backend is at "Phase 0/1" and that most data is still in
localStorage. All seven phases shipped. Correct it.
