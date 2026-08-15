# Runbook — deploying

**There is no pipeline.** This directory is not a git repository, so `.github/workflows/ci.yml` is
inert and every gate below is run by hand. That is the largest deployment risk the project has, and
it is a known one (BUG-031).

Three things deploy independently and in this order: **migrations → edge functions → frontend**.
Skipping the order is how you ship a client that talks to a function that does not exist yet.

---

## 1. Gates, before anything leaves the machine

```bash
npm run typecheck    # the build does NOT typecheck — SWC strips types without checking
npm test             # 498 unit tests
npm run build        # must be clean, not merely successful
npm run e2e          # 30 Playwright specs, against a running dev server
```

`npm run typecheck` is not optional. `vite build` once produced a clean bundle over 17 real type
errors, all of them in code that touched money.

## 2. Migrations

See [apply-a-migration.md](apply-a-migration.md). Nothing else deploys until the schema the code
expects is in place.

## 3. Edge functions

```powershell
$env:SUPABASE_ACCESS_TOKEN = '<token>'
$sb   = 'F:\Movie\AK\FinRoot\.tools\supabase\supabase.exe'
$root = 'F:\Movie\AK\FinRoot\_extracted'

& $sb functions deploy po-auth          --project-ref <ref> --workdir $root
& $sb functions deploy billing-api      --project-ref <ref> --workdir $root
& $sb functions deploy live-price       --project-ref <ref> --no-verify-jwt --workdir $root
& $sb functions deploy payments-webhook --project-ref <ref> --no-verify-jwt --workdir $root
```

- **`send-email` must not be deployed.** It is an authenticated open mail relay (BUG-005). It stays
  in the repository as the thing to fix, not to ship.
- `--no-verify-jwt` is correct for the two functions that are called by a machine (a payment
  provider's webhook; the price fetcher) and wrong for everything else. It is mirrored in
  `supabase/config.toml` so a redeploy cannot quietly flip it.
- Deploying works without Docker — the CLI only warns.

**🔴 Deploy order matters within a function too.** The Stage 4.3 `live-price` rewrite changed the
contract from `GET ?symbol=` to a batched `POST`. A new client against the old function gets no
prices at all — and the UI falls back to stored book values, so it looks like a flat market rather
than an outage. Old-client-against-new-function is safe (the GET path was retained deliberately).
When a function's contract changes, **deploy the function before the frontend**, and keep the old
entry point until the old clients are gone.

## 4. Frontend

`npm run build` produces `dist/`. Hosting configuration is in the repository and is part of the
deployment, not an afterthought:

- `vercel.json` and `public/_headers` carry the CSP and cache rules. They are kept in step by hand —
  changing one and not the other is a real failure mode.
- The CSP no longer allows `fonts.googleapis.com` / `fonts.gstatic.com`, so **a font moved back to
  Google Fonts fails closed** (fonts are self-hosted in `public/fonts/`).
- `public/` files are **not** content-hashed by Vite, so `/fonts/*` has an immutable cache rule and
  a changed file needs a changed filename.
- The service worker (`public/sw.js`) is registered in production builds only. It caches navigations
  and hashed assets; it deliberately does not intercept Supabase or font requests.

After deploying, load the site and check: no console errors, the landing page makes **zero** requests
to `googleapis`/`gstatic`, and one authenticated route renders real data.

## 5. Environment

| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` / `_PUBLISHABLE_KEY` / `_PROJECT_ID` | `.env*`, host config | public by design |
| `VITE_PAYMENTS_CLIENT_TOKEN` | host config | absent → the UI says "contact us" ([ADR-0005](../adr/0005-defer-the-payment-gateway.md)) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Supabase function secrets | `send-email` no-ops without them, and is not deployed anyway |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase function env only | never in a `VITE_` variable, never in the browser |

`supabase/config.toml` must name the intended project. It once still named a project that had been
deleted, so a bare deploy targeted a dead host and reported success-shaped output.

## 6. Rollback

There isn't one, and pretending otherwise is worse than saying so.

- **Frontend:** redeploy the previous build. The host keeps them; this is the only genuinely
  reversible layer.
- **Edge function:** redeploy the previous source. Keep it until the new one has been exercised.
- **Migration:** no down scripts by design. The way back is a new migration that reverses the
  change, written deliberately — which is why step 1 of the migration runbook is "read it again".
