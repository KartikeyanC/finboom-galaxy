# Production Readiness

> Assessment date **2026-08-04**. Updated after every milestone in
> [QA_PROGRESS.md](./QA_PROGRESS.md).

---

## Verdict

> ## 🔴 NOT READY for paying subscribers
>
> **Overall score: 41 / 100.** Two Critical and thirty High findings are open. Two of them are
> exploitable from the browser console by any user who completes signup — one bypasses billing
> entirely, the other silently misroutes financial data. There are no backups, no monitoring, no
> CI, and the type-checker currently fails while the build stays green.

The product is **feature-complete and architecturally sound**. It is not operationally or
commercially safe. The gap is roughly **4–6 weeks** of focused work, of which the first week
closes most of the risk.

---

## Scorecard

| Domain | Score | Verdict |
|---|:-:|---|
| Feature completeness | 9/10 | 🟢 mature; 27 pages, 22 tables, full PO console |
| Architecture | 7/10 | 🟢 sound layering, uniform RLS, audited privileged RPCs |
| Data model | 7/10 | 🟢 correct types and cascades; ⚠️ tenancy resolved by a default |
| **Security** | **3/10** | 🔴 plan bypass, forgeable audit, open mail relay, no rate limiting |
| **Multi-tenancy** | **3/10** | 🔴 client never uses `tenant_id`; no workspace switcher |
| **Billing** | **3/10** | 🔴 self-upgradeable; coupons inert; landing prices ≠ catalogue |
| Authentication | 6/10 | 🟡 solid GoTrue base; no MFA, no throttling, dead remember-me |
| Authorization | 5/10 | 🟡 RLS is real; feature gating is cosmetic |
| **Data correctness** | **4/10** | 🔴 synthetic net-worth history, client-authored `spent`, no transfers |
| Performance | 4/10 | 🟡 2.56 MB bundle, no pagination, per-holding polling |
| **Reliability** | **2/10** | 🔴 no error boundary, no monitoring, no alerting |
| **Backup / DR** | **0/10** | 🔴 none exists |
| **Testing** | **2/10** | 🔴 ~2 % coverage; typecheck and lint both failing |
| **CI/CD** | **0/10** | 🔴 no pipeline |
| Accessibility | 4/10 | 🟡 Radix baseline is good; measured AA contrast failures, no landmarks |
| UX | 5/10 | 🟡 strong import and empty states; no onboarding, high PIN friction |
| Documentation | 6/10 | 🟡 this audit + `DESIGN.md`; `README` is a placeholder, `CLAUDE.md` is stale |
| Compliance | 2/10 | 🔴 no privacy/terms pages, no consent record, no export/erasure |
| **Total** | **41/100** | |

---

## Go / No-Go checklist

### 🔴 Blockers — none of these may remain open

| # | Item | Ref | Status |
|---|---|---|---|
| 1 | Owner cannot self-grant a paid plan | BUG-001 | ❌ |
| 2 | `log_audit` / `create_notification` not callable by users | BUG-003/004 | ❌ |
| 3 | `send-email` cannot relay arbitrary mail | BUG-005 | ❌ |
| 4 | Rate limiting on `po-auth` and password reset | BUG-006 | ❌ |
| 5 | Paddle webhook rejects replays | BUG-008 | ❌ |
| 6 | Backups enabled **and a restore rehearsed** | BUG-030 | ❌ |
| 7 | Error monitoring + a React error boundary | BUG-013 | ❌ |
| 8 | CI gating typecheck, lint, tests, audit | BUG-031 | ❌ |
| 9 | `tsc` exits 0 | BUG-014 | ❌ |
| 10 | `npm audit --omit=dev` clean of fixable Highs; `xlsx` mitigated | BUG-032 | ❌ |
| 11 | `config.toml` no longer targets live | BUG-033 | ❌ |
| 12 | Live schema state reconciled and recorded | BUG-034 | ❌ |
| 13 | Multi-workspace writes/reads are correctly scoped **or** single-workspace is enforced as a product constraint | BUG-002 | ❌ |
| 14 | Net-worth trend uses real data, or is removed | BUG-010 | ❌ |
| 15 | Landing pricing matches what is charged | BUG-019 | ❌ |
| 16 | Privacy policy and terms pages exist and are linked | — | ❌ |

**0 of 16 complete.**

### 🟡 Strongly recommended before launch

| # | Item | Ref | Status |
|---|---|---|---|
| 17 | Security headers (CSP, HSTS, frame-ancestors, nosniff) | BUG-058 | ❌ |
| 18 | A documented decision on menu-vs-paywall enforcement | BUG-021 | ❌ |
| 19 | Import de-duplication | BUG-017 | ❌ |
| 20 | Workspace suspension actually restricts access | BUG-016 | ❌ |
| 21 | `viewer` cannot export | BUG-022 | ❌ |
| 22 | Friendly error messages | BUG-012 | ❌ |
| 23 | Hardcoded "April 2026" removed | BUG-011 | ❌ |
| 24 | "Other" trip type works | BUG-009 | ❌ |
| 25 | `types.ts` regenerated; untyped Supabase handle removed | BUG-015 | ❌ |
| 26 | Device-local features migrated or clearly labelled | BUG-026 | ❌ |
| 27 | Route-level code splitting (main chunk ≤ 250 kB gz) | BUG-046 | ❌ |
| 28 | Transaction pagination | BUG-045 | ❌ |
| 29 | Mobile overflow + AA contrast fixed | BUG-028/029 | ❌ |
| 30 | Onboarding flow; PIN made optional or recoverable | BUG-036/037 | ❌ |
| 31 | Coupons applied or removed | BUG-018 | ❌ |
| 32 | Invite-by-email for users without an account | BUG-020 | ❌ |
| 33 | Staging environment | — | ❌ |
| 34 | `README.md` written; `CLAUDE.md` corrected | BUG-062/063 | ❌ |

**0 of 18 complete.**

---

## Operational readiness

| Capability | State |
|---|---|
| Staging environment | ❌ dev and live only |
| CI/CD | ❌ none |
| Rollback plan | ❌ none — migrations are append-only with no down scripts |
| Backups | ❌ none |
| Restore tested | ❌ never |
| Monitoring / alerting | ❌ none |
| On-call / escalation | ❌ undefined |
| Runbooks | ❌ none |
| Status page | ❌ none |
| Support channel | ❌ landing contact is the placeholder `hello@finroots.app` |
| Capacity plan | ❌ none |
| Cost monitoring | ❌ none — unthrottled public edge functions |
| Log retention | ❌ undefined |
| Incident process | ❌ undefined |

---

## What is genuinely ready ✅

Worth stating plainly, because it is a real asset:

- **Uniform, correct RLS** across all 22 tables — the policy shape never varies.
- **No SQL injection, no IDOR, no path to self-granting platform-admin.** Verified.
- **Audited privileged RPCs** — every PO action and member change writes `audit_log`.
- **Correct money types** (`numeric`, never float) and a single formatting/input system.
- **A coherent design system** — one chart-colour source, one money-input component, one
  icon-chip system, applied consistently.
- **Well-structured, append-only migrations** with explanatory headers.
- **A genuinely good import experience** — five datasets, templates, previews, broker guides.
- **Well-configured client caching** (React Query) and a correct service worker.
- **A working e2e harness** that already covers the PIN gate.

---

## Path to green

| Phase | Duration | Outcome | Score |
|---|---|---|---|
| **0 — Safety net** | 2–3 days | CI + Sentry + error boundary + PITR + `config.toml` fix; typecheck and lint green | 41 → 52 |
| **1 — Security blockers** | 1 week | items 1–5, 10, 11 closed; SEC-T suite passing | 52 → 68 |
| **2 — Correctness** | 2 weeks | tenancy, net worth, `budgets.spent`, transfers, pricing reconciliation, import de-dup | 68 → 80 |
| **3 — Durability & performance** | 1–2 weeks | localStorage features migrated; code splitting; pagination; live-price batching | 80 → 88 |
| **4 — Launch polish** | 1 week | onboarding, a11y, error copy, privacy/terms, README, runbooks | 88 → 93 |

**Recommended launch gate: score ≥ 85 with all 16 blockers closed.**

---

## Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Engineering | | | ⬜ |
| Security | | | ⬜ |
| QA | | | ⬜ |
| Product | | | ⬜ |
| Operations | | | ⬜ |

*No sign-off may be given while any 🔴 blocker is open.*

---

### Change log

| Date | Milestone | Score | Note |
|---|---|---|---|
| 2026-08-04 | Phase 1 audit complete | 41/100 | Baseline. No code changed. |
