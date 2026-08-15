# Risk Assessment

> Audit date 2026-08-04. Scoring: **Likelihood** (1–5) × **Impact** (1–5) = **Score** (1–25).
> Risk appetite assumed: a small, cost-first SaaS handling **real personal financial data** for
> paying subscribers — which sets a low tolerance for data loss, data corruption and privacy
> incidents, and a moderate tolerance for downtime and performance.

---

## 1. Risk register

| ID | Risk | L | I | Score | Owner |
|---|---|:-:|:-:|:-:|---|
| **R-01** | **Permanent data loss** — no backups, no PITR, hard deletes with cascade | 3 | 5 | **15** | Ops |
| **R-02** | **Revenue leakage** — any owner self-upgrades to Pro (KI-002); plan gating is cosmetic (SEC-002); coupons never apply | 5 | 4 | **20** | Eng |
| **R-03** | **Financial data shown to the user is wrong** — synthetic net-worth history, client-authored `budgets.spent`, no transfer type, merged multi-workspace totals | 5 | 4 | **20** | Product/Eng |
| **R-04** | **Silent data misrouting for multi-workspace users** (KI-001) | 4 | 5 | **20** | Eng |
| **R-05** | **Domain reputation destroyed** — `send-email` open relay used for phishing | 3 | 5 | **15** | Eng |
| **R-06** | **Undetected incident** — no monitoring, no alerting, no auth logging, forgeable audit log | 5 | 4 | **20** | Ops |
| **R-07** | **Product Owner account compromise** — unthrottled 16-digit code as a password *alternative*, enumerable, no MFA, no login audit | 2 | 5 | **10** | Eng |
| **R-08** | **Type errors reaching production** — `tsc` fails, SWC build ignores it, no CI gate | 5 | 3 | **15** | Eng |
| **R-09** | **Regression on any change** — ~2 % test coverage, no CI | 5 | 3 | **15** | Eng |
| **R-10** | **Dependency exploit** — `xlsx` prototype pollution on a user-upload path, no npm fix | 2 | 4 | **8** | Eng |
| **R-11** | **Accidental production deploy** — `config.toml` targets live; live migration state untracked | 3 | 5 | **15** | Ops |
| **R-12** | **Third-party price API breaks** — Yahoo/mfapi are unofficial, uncached, polled per-holding | 4 | 2 | **8** | Eng |
| **R-13** | **Cost blowout** — unthrottled public edge functions; O(holdings)/minute polling; unbounded queries | 3 | 3 | **9** | Ops |
| **R-14** | **Performance collapse at scale** — no pagination; the dashboard fetches every row of 8 tables | 4 | 3 | **12** | Eng |
| **R-15** | **User loses device-local work** — 6 features live only in `localStorage`, unlabelled | 4 | 3 | **12** | Product |
| **R-16** | **Regulatory exposure** — no privacy policy page, no consent record, no data export/erasure, no retention policy (India DPDP / GDPR) | 3 | 4 | **12** | Legal/Product |
| **R-17** | **Onboarding abandonment** — mandatory unexplained PIN with no recovery, empty dashboard, no tour | 5 | 3 | **15** | Product |
| **R-18** | **Support burden from silent duplication** — import is append-only with no de-dup | 4 | 3 | **12** | Product |
| **R-19** | **Billing acts on the wrong workspace** — `billing-api` keys on `user_id` | 2 | 4 | **8** | Eng |
| **R-20** | **Webhook replay** re-applies stale subscription state | 2 | 4 | **8** | Eng |
| **R-21** | **XSS → session takeover** — no CSP, token in `localStorage`. (No injection point found today) | 2 | 5 | **10** | Eng |
| **R-22** | **Supabase single point of failure** — DB, auth, edge and realtime in one vendor and one region (ap-northeast-1) | 2 | 4 | **8** | Ops |
| **R-23** | **Key-person / knowledge risk** — `README` is a placeholder, `CLAUDE.md` is out of date, no runbooks, no ADRs beyond `DESIGN.md` | 4 | 3 | **12** | Eng |
| **R-24** | **Trust damage from mis-sold pricing** — landing sells plans that do not exist in billing | 4 | 3 | **12** | Product |
| **R-25** | **Accessibility complaint / exclusion** — AA contrast failures, tap targets, no landmarks | 3 | 2 | **6** | Eng |
| **R-26** | **Lockfile drift** — three lockfiles, no pinned Node | 3 | 2 | **6** | Eng |

## 2. Heat map

```
Impact
  5 │           R-07        R-01 R-05 R-11        R-04
    │           R-21        R-22
  4 │      R-10 R-19 R-20   R-16                  R-02 R-03 R-06
    │                       R-24
  3 │                       R-13   R-14 R-15 R-18  R-08 R-09 R-17
    │                              R-23
  2 │                       R-25 R-26   R-12
  1 │
    └────┴────────┴────────┴────────┴────────┴────
         1        2        3        4        5     Likelihood
```

## 3. Top risks — analysis and treatment

### R-02 · Revenue leakage (20)
**Scenario.** A user signs up on Free, opens devtools, reads `plans` (world-readable), and
`PATCH`es their own `subscriptions` row to Pro. No payment, no audit entry, no alert. Even
without that, plan gating only hides menu items — Free users can read every Pro feature's data
over REST.
**Treatment — mitigate, immediately.** Drop `sub_update`, revoke write grants (one migration),
then decide and implement the paywall contract in RLS (AZ-001).
**Status 2026-08-05:** both done — Stage 1a revoked the `subscriptions` write grants, and Stage
2.15 put `has_menu()` into the RLS of every table that maps 1:1 to a menu, so the paywall is
real. The `transactions`-backed menus remain navigation-only by design.
**Residual after fix:** Low.

### R-03 · Wrong financial numbers (20)
**Scenario.** Four independent sources of incorrect figures: the net-worth trend is synthetic
seed data; `budgets.spent` is a client-written column that does not follow logged expenses;
there is no transfer type, so internal movements inflate income and spending; and
multi-workspace users see merged totals.
For a personal-finance product this is the most brand-damaging risk in the register — the
numbers are the product.
**Treatment — mitigate.** Remove or back the net-worth chart with real snapshots; derive
`spent` server-side; add a transfer type; fix KI-001.
**Residual:** Low–Medium (FX rates remain manually entered).

### R-04 · Multi-workspace data misrouting (20)
**Scenario.** An owner invites their accountant. The accountant, who already has a personal
FinRoot workspace, logs in, sees both workspaces' transactions merged, and every expense they
record lands in their own workspace instead of the client's. Nothing errors.
**Treatment — mitigate.** Explicit `tenant_id` on all reads/writes. Until then, **document
single-workspace-per-user as a hard product constraint** and disable inviting users who already
own a workspace.
**Residual:** Low after fix.

### R-06 · Undetected incident (20)
**Scenario.** Any of R-02, R-05 or a data-corruption bug occurs and nobody knows. There is no
error monitoring, no uptime check, no auth-event logging, and the audit log is forgeable by any
user (KI-003).
**Treatment — mitigate.** Sentry + error boundary + uptime check + revoke `log_audit` from
PUBLIC + log PO and failed sign-ins. This is the cheapest high-value item in the register.

### R-01 · Permanent data loss (15)
**Scenario.** A migration typo, a mis-clicked `po_delete_tenant` (hard delete, full cascade, no
confirmation of scope), or a Supabase incident destroys customer financial history with no
recovery path.
**Treatment — mitigate + transfer.** Enable Supabase PITR (requires Pro, ~$25/mo — this is the
one place where the cost-first constraint should yield), add nightly `pg_dump` to object
storage, convert tenant deletion to soft-delete with a 30-day window, and **rehearse a restore**.
See [Disaster_Recovery.md](./Disaster_Recovery.md).

### R-05 · Domain reputation (15)
**Scenario.** A user scripts `send-email` to blast phishing that passes SPF/DKIM for your
domain. Resend suspends the account; your domain lands on blocklists; password-reset and invite
mail stop arriving for everyone.
**Treatment — avoid.** `send-email` is currently a no-op (no `RESEND_API_KEY`) and has exactly
one best-effort caller. **Undeploy it now**, and reintroduce it only as a template-id API with
server-resolved recipients.

### R-17 · Onboarding abandonment (15)
**Scenario.** A new user confirms their email, is immediately required to invent a PIN with no
explanation and no recovery, then lands on an empty dashboard with no guidance. The two
highest-friction moments in the funnel are back to back.
**Treatment — mitigate.** Make the PIN opt-in (or at least explained and recoverable), add a
three-step first-run checklist, and offer sample data.

### R-11 · Accidental production deploy (15)
**Scenario.** `supabase db push` is run in the repo root. `config.toml` names the live project,
so an untested migration hits production — where the applied-migration state is unknown and
there are no backups (R-01). This is the compounding risk in the register.
**Treatment — avoid.** Remove `project_id` from `config.toml`; require `--project-ref` in every
documented command; reconcile and record the live schema state.

### R-08 / R-09 · Type errors and regressions (15 each)
`tsc` currently fails with 10 errors while the build stays green, `strict` is off, ESLint fails,
coverage is ~2 %, and nothing gates a change. Every fix recommended in this audit lands into a
codebase with no safety net.
**Treatment — mitigate first.** Stand up CI (typecheck + lint + vitest + e2e + `npm audit`)
**before** the Sprint-0 fixes, so the fixes themselves are verified.

## 4. Accepted risks (with rationale)

| Risk | Why acceptable now | Revisit when |
|---|---|---|
| R-22 single-vendor, single-region | cost-first constraint; Supabase SLA is adequate for early scale | >100 paying tenants, or an enterprise customer asks |
| R-12 unofficial price APIs | live prices are a convenience feature; the stored value is the fallback | prices become a headline feature |
| R-25 accessibility gaps | no legal exposure at current scale | public-sector or enterprise sales, or any EU B2B customer |
| R-10 `xlsx` | mitigated by dropping `.xlsx` support (CSV covers every template) | if `.xlsx` import is kept |

## 5. Risk-reduction sequence

| Stage | Actions | Risks reduced |
|---|---|---|
| **0 — safety net** (2–3 d) | CI: typecheck, lint, vitest, e2e, `npm audit`. Sentry + `ErrorBoundary`. Enable PITR. Point `config.toml` away from live. | R-08, R-09, R-06, R-01, R-11 |
| **1 — stop the bleeding** (1 wk) | Revoke `subscriptions` writes; revoke `PUBLIC EXECUTE`; undeploy `send-email`; remove the `tenants` insert policy; fix `trips.kind`; rate-limit `po-auth`; webhook replay window | R-02, R-05, R-07, R-20 |
| **2 — correctness** (2–3 wk) | Explicit `tenant_id`; derive `budgets.spent`; real net-worth snapshots; transfer type; import de-dup; reconcile pricing | R-03, R-04, R-18, R-24 |
| **3 — durability & scale** (3–4 wk) | Move localStorage features to the DB; pagination + indexes; code splitting; batch/cache live prices; soft delete | R-14, R-15, R-13 |
| **4 — compliance & polish** (ongoing) | Privacy/terms pages, consent record, export + erasure, retention policy; accessibility remediation; documentation and runbooks | R-16, R-25, R-23 |
