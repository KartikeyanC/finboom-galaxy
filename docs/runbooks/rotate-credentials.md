# Runbook — rotating credentials

Every secret this project uses, where it lives, what breaks when it changes, and what to do if one
leaks. **No value is written down in this repository** — this is the map, not the keyring.

---

## The inventory

| Credential | Lives in | Rotating it breaks | Blast radius if leaked |
|---|---|---|---|
| Supabase **personal access token** (`sbp_…`) | an operator's shell only | migrations, type generation, function deploys | **Account-wide.** Every project on the account, not just this one |
| Database password | Supabase dashboard; used in the pooler URL | `db push` | Direct SQL as `postgres` — total |
| **Service role key** | Supabase function env only | edge functions that use it | Bypasses RLS entirely — every row of every workspace |
| **Anon / publishable key** | `.env*`, host config, the shipped bundle | nothing until rotated everywhere | Low by design: it is public, and RLS is the boundary |
| `VITE_PAYMENTS_CLIENT_TOKEN` | host config | checkout (absent → "contact us") | Low — a client token |
| Paddle **webhook secret** | function secrets | `payments-webhook` signature checks | Forged subscription events |
| `RESEND_API_KEY` | function secrets | outbound mail (currently none — `send-email` is not deployed) | Mail sent as you |
| PO **16-digit secret code** | `platform_admins.secret_hash` (bcrypt) | the PO's alternative sign-in | Product Owner console access |
| `.env.e2e` demo account | local file, gitignored | the Playwright suite | A real account that is **also a platform admin** |

## Rotating each

**Personal access token.** Dashboard → Account → Access Tokens → revoke, create a new one. Set
`$env:SUPABASE_ACCESS_TOKEN` in the shell that needs it. Never put it in a file in this repository.
Treat it as account-wide: a token created for one afternoon's migration can reach every project on
the account, which is why sessions that no longer need one should say so and have it revoked.

**Database password.** Dashboard → Project Settings → Database → Reset. Then rebuild the pooler URL
(URL-encode it — `&` becomes `%26`) and re-run any `db push` that was interrupted.

**Service role key.** Dashboard → Project Settings → API → rotate, then update the function
environment and redeploy the functions that read it. **It must never appear in a `VITE_` variable**:
anything prefixed `VITE_` is inlined into the browser bundle by Vite, and this key bypasses RLS.

**Anon key.** Rotate in the dashboard, then update `.env*`, the host's environment, and rebuild the
frontend. Old bundles stop working, so do it deliberately rather than casually.

**PO secret code.** Signed in as the platform admin: `select po_set_secret('<16 digits>');` — it is
bcrypt-hashed by the function, and `po_verify_secret` is revoked from `PUBLIC` and reachable only
through the `po-auth` edge function.

**The e2e demo account.** Change the password in the app, update `.env.e2e`, re-run
`npm run e2e`. This account is a platform admin and holds the demo workspace — it must be removed
before the project faces real users, not merely rotated.

## If something has leaked

1. **Rotate first, investigate second.** Every credential above can be rotated in minutes; working
   out the exposure takes longer, and the two are not in the same order of urgency.
2. **Check `audit_log`** for what happened while the key was valid — PO actions, plan changes,
   member changes and tenant status changes all land there.
3. **Service role or database password:** assume every row was readable. That is a customer
   notification decision, not just a technical one; see the breach commitments in the
   [Privacy Policy](../../src/pages/legal/PrivacyPolicy.tsx).
4. **Anon key:** not by itself an exposure. Check RLS instead — the anon key is only ever as
   dangerous as the weakest policy, which is the thing worth auditing.
5. Write down what happened and when, in [Improvement_Roadmap.md](../Improvement_Roadmap.md) or a
   dated note. An incident nobody recorded gets re-litigated from memory six months later.

## Hygiene

- `.env`, `.env.development`, `.env.production`, `.env.e2e` are gitignored. `.env.e2e.example`
  documents the shape without the values, and that is the pattern to follow for any new secret.
- Function secrets belong in Supabase's function environment, never in the repository.
- The Supabase CLI here is a standalone binary at `F:\Movie\AK\FinRoot\.tools\supabase\`, so a
  global npm install cannot silently pick up a different token from a different machine's config.
