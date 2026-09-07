# ADR-0011 — The mobile app shares the backend and the money logic through a monorepo

**Status:** Proposed (2026-09-07). Nothing here is built. It records the shape a split will take
*when* the mobile app is staffed, and the gate that decides whether that is now.

## Context

The platform scope is web dashboard **and** a mobile app — nothing else. The web app exists; the
mobile app does not. When it is built it needs the same data as the web app, and three things in
particular must never compute differently on the two:

- **The money arithmetic** — savings rate, `toINR()`, budget buckets, the dashboard and calendar
  roll-ups. ADR-0006 already says these are derived, never stored; if each app derives them from its
  own copy of the code, "derived" stops being one answer.
- **The Supabase contract** — the generated `types.ts`, and the exact shape of every RLS-scoped
  query. A hand-maintained second copy drifts the first time a migration lands.
- **The access model** — `is_tenant_member`, `get_effective_menus`, the menu contract of ADR-0002.

The backend itself is already client-agnostic. Supabase project `ludbntvhagefadfkhrjj` — Postgres,
Auth, the six edge functions, Storage — serves any client that carries a session and obeys RLS.
A native app authenticates the same users and is enforced by the same policies with **zero
server-side change**. The 73 migrations do not move.

Three shapes were considered:

1. **A second repository.** Rejected. The money logic and the query hooks would be duplicated or
   published as a package across a repo boundary — either way the two apps drift, and the drift is
   silent until a user notices the phone disagrees with the laptop.
2. **Stay responsive-web; no native app.** Not rejected — *deferred to the gate below.* Every page
   already collapses to one column on a phone and the PWA is installable. If there is no funded
   mobile effort, this is the correct answer and this ADR stays Proposed.
3. **A workspace: two apps, shared packages, one backend.** Taken, when the gate opens.

## Decision

**When the mobile app is built, the repository becomes a pnpm workspace.** The three things that
must not diverge move into packages both apps import; everything platform-shaped stays in its app;
`supabase/` stays at the root, shared and unchanged.

```
finroot/
├─ apps/
│  ├─ web/            the current Vite app, moved here verbatim
│  └─ mobile/         Expo + Expo Router
├─ packages/
│  ├─ core/           pure logic — finance, ledgerPeriod, calendarMonth,
│  │                  calendarEvents, deriveSummary, zod schemas, menu contract.
│  │                  deps: zod, date-fns. no react, no network.
│  ├─ data/           createFinrootClient({ url, anonKey, storage }) +
│  │                  the TanStack Query data hooks + Tenant/Access contexts
│  ├─ supabase-types/ the generated types.ts — one file, one regen script
│  └─ tokens/         theme scale as JSON, read by Tailwind (web) and NativeWind (mobile)
├─ supabase/          migrations (append-only) + functions — shared, unchanged
├─ tooling/           shared eslint + tsconfig bases
└─ package.json       workspace root
```

The single load-bearing refactor is the Supabase client. `src/integrations/supabase/client.ts` is
hard-wired to `localStorage` and `import.meta.env`; it becomes
`createFinrootClient({ url, anonKey, storage })` in `@finroot/data`. Web passes
`window.localStorage` and Vite env; mobile passes an `expo-secure-store` adapter and Expo config.
Everything that reaches for `localStorage` directly — `ThemeContext`, `appLock`, `deviceLocal` —
stays app-side behind a small storage port, because those are per-device by design (ADR-0003,
ADR-0007) and have no business in a shared package.

**What does not cross the boundary, on purpose:** the 38 shadcn/Radix primitives and the 106 feature
components. Mobile rebuilds its component layer from `@finroot/tokens`. Trying to share a component
across the DOM/native line produces a lowest-common-denominator abstraction that serves neither.
The Product Owner console stays web-only. A tablet is a responsive layout inside the mobile app,
not a third target.

### The gate — Phase 0

Before any file moves, one ADR-sized decision resolves three questions, or the split does not start:

- **Lovable.** The web app is edited through Lovable today (`lovable-tagger` in `vite.config.ts`,
  `src/integrations/lovable/`, `@lovable.dev/cloud-auth-js`). Lovable expects a Vite project at the
  repo root; moving it under `apps/web/` will break that sync. Either the team is ready to hand-edit
  the web app from here, or the monorepo waits.
- **pnpm vs npm workspaces.** pnpm is the recommendation — hoisting control matters once two React
  trees share a lockfile. This replaces `package-lock.json` and touches CI and every `scripts/*.mjs`.
- **Expo vs bare React Native.** Expo is the recommendation — EAS build, OTA, `expo-secure-store`,
  and auth deep-linking are handled rather than assembled.

### The migration order

Each step ends green — `build`, `test`, `e2e`, and the web deploy — before the next begins.

| # | Step | Effort |
|---|---|---|
| 1 | Root `package.json` + `pnpm-workspace.yaml`; `git mv` the app to `apps/web/`; repoint every config (`@/` alias, vite, tsconfig, playwright, vitest, `components.json`, scripts, `.env*`, deploy, CI). No logic changes. | ~2–3 days |
| 2 | Extract `@finroot/core` — the ~40 of 53 `src/lib/*` files that import neither React nor Supabase, with their tests. Its `package.json` names `zod` and `date-fns` and nothing else. | ~3–4 days |
| 3 | Extract `@finroot/data` — the client factory, the data hooks, the Tenant/Access contexts. No `import.meta.env` or bare `localStorage` survives under `packages/`. This is the real refactor. | ~1 week |
| 4 | Scaffold `apps/mobile` (Expo). Wire `@finroot/core` + `@finroot/data` with SecureStore and an auth deep link. Build one screen — the ledger or dashboard — end to end on a device against real data. | ~1 week |
| 5 | Port screens in dependency order; reimplement the PIN on SecureStore + biometrics; publish the theme tokens. Finish the `lib/*Store.ts` localStorage holdouts into tenant tables first — a half-migrated store cannot be shared. | ongoing |
| 6 | Steady state: one `supabase/migrations` flow; `supabase gen types` runs in CI and fails on a stale `@finroot/supabase-types`; one release checklist; packages versioned with the apps. | folded in |

Roughly **4–6 focused weeks to a mobile vertical slice** on real data, one person, prior steps green.

## Consequences

- **Lovable is the thing that decides the timing, not the tooling.** If the team wants to keep
  building the web app in Lovable, this ADR stays Proposed. There is no partial version.
- **`import.meta.env` is a Vite-ism and it is everywhere.** Every reference that ends up under
  `packages/` has to funnel through a config object the host app injects, or the package will not
  compile for Metro/Expo. This is grep-and-route work that must happen before step 3.
- **The component layer doubles.** ~145 web components have no mobile equivalent and never will.
  Budgeting mobile as "port the screens" is wrong; it is "rebuild the screens against the same
  hooks". The shared surface is logic and data, not UI.
- **Auth grows a native shape.** Session persistence moves to SecureStore, OAuth and
  password-reset become deep links, and the `markSignInIntent` lock dance — which exists because
  `supabase-js` fires `SIGNED_IN` on every session restore — needs a native equivalent. None of
  this is hard; all of it is new.
- **A monorepo is standing overhead on a cost-first team.** Two apps to build in CI, a task runner
  to keep fast, two React runtimes to dedupe. Same Supabase project and the same free-tier request
  budget — no new paid service — but the day-to-day friction is real and is the reason the gate
  exists.
- **The demo account contends harder.** Playwright already serialises because every spec signs in
  as `demo@finroot.app`; a second app's e2e makes that worse. Mobile e2e gets its own seeded
  account.
- **`docs/` and the migrations stay the single source.** The ADR log, the runbooks, and
  `supabase/migrations` are not per-app. The append-only rule and the one-implementation rule
  (ADR-0008) apply across both apps exactly as they do across the current one.

## Where it lives

Nowhere yet — nothing is built. When step 1 lands, this ADR moves to **Accepted** and this section
names the workspace root, `packages/core`, `packages/data` and the `createFinrootClient` factory.
Until then it is the reference the Phase 0 discussion argues against.
