# Authorization Flow

> Audit date 2026-08-04. Companion: [Authentication_Flow.md](./Authentication_Flow.md),
> [Database_Report.md](./Database_Report.md), [API_Report.md](./API_Report.md).

---

## 1. The three authorization dimensions

| Dimension | Question | Enforced by | Trustworthy? |
|---|---|---|---|
| **Row access** | may this user touch this row? | Postgres RLS · `is_tenant_member(tenant_id, min_role)` | ✅ yes |
| **Feature access** | may this user open this page? | `get_effective_menus()` → `AccessContext` → `MenuGuard` | ❌ **client-side only** |
| **Platform access** | is this the Product Owner? | `is_platform_admin()` inside each PO RPC | ✅ yes |

## 2. Roles

```
platform admin (Product Owner)   ── not a tenant member; aggregate + management RPCs only
        │
tenant owner   (3) ── full row access, manage members, edit subscription row (⚠️)
tenant admin   (2) ── full row CRUD, no member management
tenant viewer  (1) ── SELECT only
```

`is_tenant_member(p_tenant_id, p_min_role)` ranks `owner 3 > admin 2 > viewer 1` and requires
`status = 'active'`. It is `SECURITY DEFINER` so it can read `tenant_members` without
triggering recursive RLS — the correct pattern.

Note the asymmetry: **admin ≡ owner for data**. The only owner-exclusive powers are member
management, tenant update/delete, and (unintentionally) the subscription row.

## 3. Row-level policy shape

Applied identically to all 15 tenant tables:

```sql
SELECT  USING      (is_tenant_member(tenant_id,'viewer'))
INSERT  WITH CHECK (is_tenant_member(tenant_id,'admin'))
UPDATE  USING/CHECK(is_tenant_member(tenant_id,'admin'))
DELETE  USING      (is_tenant_member(tenant_id,'admin'))
```

Platform tables add `OR is_platform_admin()` where the PO legitimately needs visibility
(`tenants`, `tenant_members`, `profiles`, `audit_log`, `subscriptions`, `coupons`,
`site_settings`).

**Consequence of the PO bypass:** any client query against `tenant_members` run by a PO returns
*every* tenant's rows. `TenantContext` compensates with an explicit `.eq("user_id", user.id)`.
Any future query that "relies on RLS" without that filter will silently over-fetch for a PO.

## 4. Feature/menu resolution

```
get_effective_menus(tenant_id)          -- SECURITY DEFINER, STABLE
  role := tenant_members.role for auth.uid()
  if role is null            → []                      -- not a member
  base := plan_menus(tenant)                           -- the ceiling
  if role = 'owner'          → base                    -- owner ignores overrides
  base := base − tenants.menu_overrides->'deny'
  if member.menu_overrides ? 'allow'
      base := base ∩ member.menu_overrides->'allow'
  return base
```

```
plan_menus(tenant)
  menu_set := the tenant's subscription's plan, where
              status ∈ {active,trialing} AND (period_end IS NULL OR period_end > now())
  fallback := plans[name='Free'].menu_set
  if menu_set @> '["*"]'  → all_feature_menus()
```

Layer semantics: **plan = ceiling**, **tenant override = deny-list**, **member override =
allow-list**. Owners bypass both override layers but not the plan.

Canonical menu ids (`all_feature_menus()`, 14): `dashboard, income, expenses, investments,
budget, goals, reminders, calculator, bill-scan, import, insurance, net-worth, trips, billing`.
The client's `src/lib/accessMenus.ts` lists the same 14 — **maintained by hand in two places**
with no test asserting they match.

## 5. Client consumption

```
AccessProvider
  ├─ get_effective_menus(currentTenantId) → effectiveMenus: string[] | null
  ├─ list_tenant_members(currentTenantId) → members
  ├─ ALWAYS_ALLOWED = {accounts, settings, profile, notifications}
  ├─ canAccess(menuId)  = ALWAYS_ALLOWED ∨ effectiveMenus === null ∨ includes(menuId)
  ├─ canWrite(menuId)   = role ≠ viewer ∧ (owner ∨ canAccess)
  └─ viewAs preview     = owner-only, client-side simulation of a collaborator's menus
        ↓
   MenuGuard (route)   ·   AppSidebar (nav)   ·   dashboard widget gating
```

## 6. Findings

### AZ-001 · Menu authorization has no server-side counterpart — **RESOLVED 2026-08-05 (Stage 2.15)**

*Was:* restricting a menu removed the link and blocked the route, but the underlying tables stayed
readable and writable over REST for any member. A `viewer` limited to `{dashboard}` could still
`GET /rest/v1/insurance` and `GET /rest/v1/investments`. Because plans use the same mechanism,
**the paywall was cosmetic**: a Free tenant could read and write every Pro feature's data directly.

**The decision: menus are a real permission and a real paywall wherever a feature owns its own
table, and navigation-only where features share `transactions`.** Migration
`20260805230000_stage2_menu_paywall.sql` adds `has_menu(tenant_id, menu)` — a thin wrapper over
the same `get_effective_menus()` the sidebar calls — and ANDs it into all four RLS policies of
eleven tables.

| Menu | Tables gated in RLS |
|---|---|
| `investments` | `investments`, `demat_accounts`, `demat_ledger` |
| `insurance` | `insurance` |
| `trips` | `trips` |
| `net-worth` | `net_worth_entries`, `net_worth_snapshots` |
| `reminders` | `reminders` |
| `goals` | `goals` |
| `budget` | `budgets` |
| `income` | `income_streams` |

**Navigation-only, by design:** `dashboard`, `expenses`, `import`, `bill-scan`, `calculator`,
`billing`. These read and write the shared `transactions` table (or no table at all), so a row
cannot be attributed to one menu without inventing a category→menu mapping — and a wrong mapping
would silently drop rows out of the dashboard, the budget-spend derivation and every aggregate.
`accounts`, `settings`, `profile` and `notifications` are `ALWAYS_ALLOWED` and likewise ungated.
**Do not describe these six as permissions in UI copy.** They are navigation.

Two details that make the fix hold:

- `has_menu()` **delegates to `get_effective_menus()` rather than reimplementing it.** AZ-001 was
  caused by the client and the server holding different beliefs about what a menu means; two
  independent implementations would drift again, one cannot.
- `goal_contribute()` and `budget_set_allocation()` are `SECURITY DEFINER` and so bypass RLS
  entirely. Both received an explicit `has_menu()` check. They are the only definer functions that
  write a gated table (verified by grep across every migration).

Enforced both ways by `src/lib/menuContract.ts` + `menuContract.test.ts` (11 tests, offline): every
id in `ACCESS_MENUS` must be classified as enforced **or** navigation-only, and the table/menu pairs
in the migration must match the TypeScript map exactly.

**Verified live** against `ludbntvhagefadfkhrjj` with a throwaway user, asserting on row counts
(an RLS-filtered SELECT returns 200 with an empty array — never assert on status): with an
investment and a policy seeded as `service_role`, a Roots owner read **0** rows from both and was
refused both inserts, while `goals` (in the Roots menu set) stayed readable; after an upgrade to
Canopy the same reads returned the rows and the insert succeeded; `goal_contribute` flipped from
allowed to refused when `goals` was removed from the plan.

See AZ-009 for the one limitation this exposed.

### AZ-002 · `AccessContext` fails open — **Medium**
`effectiveMenus` starts as `null` (meaning "loading → allow everything, avoid a flash"). If the
`get_effective_menus` RPC errors, it *stays* `null` and `canAccess` returns `true` for every
menu, for the whole session. A transient network failure grants full navigation.

*Fix:* distinguish `loading` from `loaded` with an explicit state; on error, render an error
state rather than an open one.

### AZ-003 · `viewAs` is a client-only simulation — **Low (by design, but mislabelled)**
The owner's "view as collaborator" selector swaps `allowedMenus` locally. All queries still run
with the owner's JWT and full row access. It is a preview, and the "Restricted view" banner
implies more than it delivers.

### AZ-004 · Six `/app` routes bypass `MenuGuard` — **Medium**
`/app/settings`, `/profile`, `/notifications`, `/export`, `/workspace`, `/accounts`,
`/billing` render without a guard. `billing` **is** in `all_feature_menus()` and in
`ACCESS_MENUS`, so a PO who removes `billing` from the Free plan changes nothing —
`/app/billing` still renders and Paddle checkout still works.
`/app/export` is arguably the most sensitive ungated route: it exports the entire workspace
dataset and is available to a `viewer`.

### AZ-005 · `canWrite` is advisory — **Medium**
`isReadOnly` (viewer) hides buttons, but the `viewer` role is enforced server-side by RLS, so
this one is actually backed. The gap is that **`canWrite` is not consistently consulted** — a
grep shows most mutation call sites do not check it, relying on RLS to reject. That is the safe
direction (server wins), but it produces raw Postgres permission errors instead of a friendly
"read-only" message.

### AZ-006 · No workspace switcher — **Medium (UX + correctness)**
`TenantContext.setCurrentTenantId` exists but **nothing calls it**. A user in two workspaces is
pinned to `memberships[0]`, cannot switch, and — because of KI-001 — sees both workspaces'
finance data merged anyway.

### AZ-007 · Owner can self-modify billing — **Critical**
See SEC-001 / DB-002. The `sub_update` policy makes plan level a client-controlled field.

### AZ-008 · Privilege-escalation surface — audit result
Checked and **not exploitable**:
- `set_member_menus` / `update_member_role` / `revoke_member` all exclude `role = 'owner'`, so a
  collaborator cannot demote the owner and an owner cannot be revoked by another owner-level
  actor other than the PO.
- `invite_member` restricts `p_role` to `admin|viewer`; no path grants `owner` via RPC.
- `platform_admins` has **no INSERT or UPDATE policy** and no RPC that inserts — a user cannot
  make themselves a Product Owner through the API. Seeding requires service-role/SQL access. ✅
- `tenant_members` direct writes require `is_tenant_member(tenant,'owner')`, so a viewer cannot
  self-promote. ✅

### AZ-009 · A tenant-level menu denial does not bind the workspace owner — **Medium**
Found while verifying AZ-001. `get_effective_menus()` short-circuits an owner straight to
`plan_menus()`:

```sql
IF v_role = 'owner' THEN
  RETURN v_base;      -- tenant deny-list and member allow-list are never applied
END IF;
```

So `po_set_tenant_menus(tenant, '{"deny":[...]}')` restricts every collaborator but leaves the
owner with the full plan menu set — and, since 2.15, with full data access too. Measured: with
`investments` denied at tenant level on a Canopy workspace, the owner still read every investment
row.

This is pre-existing behaviour, not something 2.15 introduced, but 2.15 makes it matter more: the
PO's "N / 14 modules enabled" editor in `PoTenants.tsx` presents per-tenant module selection as if
it binds the whole workspace, and for the owner it does not.

*Decide:* either apply the tenant deny-list to owners as well (one-line change — move the owner
short-circuit below the deny step — but it lets a PO withhold a module the customer is paying
for), or relabel the PO control as "modules for collaborators". **Not changed here:** it alters
who can see what, which is a product call rather than a bug fix. Tracked as BUG-081.

## 7. Effective permission matrix

| Capability | Viewer | Admin | Owner | PO |
|---|:-:|:-:|:-:|:-:|
| Read tenant finance rows (REST) | ✔ | ✔ | ✔ | ✖ (aggregates only) |
| Write tenant finance rows | ✖ | ✔ | ✔ | ✖ |
| Read data behind a *denied* menu — enforced menus | ✖ | ✖ | ✖ | ✖ |
| Read data behind a *denied* menu — navigation-only menus | ✔ (by design) | ✔ (by design) | ✔ (by design) | ✖ |
| Manage members | ✖ | ✖ | ✔ | ✔ |
| Change tenant name/status | ✖ | ✖ | ✔ | ✔ |
| Change own plan | ✖ | ✖ | **✔** ⚠️ | ✔ |
| Read `audit_log` | ✖ | ✖ | ✔ (own tenant) | ✔ (all) |
| Write `audit_log` (forge) | **✔** ⚠️ | **✔** ⚠️ | **✔** ⚠️ | ✔ |
| Create notifications for anyone | **✔** ⚠️ | **✔** ⚠️ | **✔** ⚠️ | ✔ |
| Suspend/delete a tenant | ✖ | ✖ | delete own | ✔ |
| Edit plans / pricing / branding / coupons | ✖ | ✖ | ✖ | ✔ |

⚠️ = gap documented above.

## 8. Recommendations

1. **AZ-007 / SEC-001** — revoke `subscriptions` write access (one migration, highest value).
2. ~~**AZ-001** — make a written decision on menu semantics; if it is a paywall, enforce it in RLS.~~
   **Done 2026-08-05 (Stage 2.15).** Next: settle AZ-009 (does a tenant deny bind the owner?).
3. **DB-003** — revoke `PUBLIC EXECUTE` on `log_audit` and `create_notification` (closes two
   rows of the matrix above).
4. **AZ-002** — make `AccessContext` fail closed.
5. **AZ-004** — add `MenuGuard` to `/app/billing` and `/app/export`; decide the intent for the
   others and document `ALWAYS_ALLOWED`.
6. **AZ-006** — add a workspace switcher, and only after KI-001 is fixed.
7. Add a test that asserts `all_feature_menus()` equals `ACCESS_MENUS` ids.
