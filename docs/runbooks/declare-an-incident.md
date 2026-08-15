# Runbook — declaring an incident

The public status page at `/status` runs its own live checks, but they only see what a browser can
reach. Everything else — a data problem, a slow provider, planned maintenance, an outage you already
know about — has to be said out loud by a person. This is how.

**Two minutes, from `/po/status`.** Doing it early is almost always right: an incident nobody
announced generates support mail, and answering the same question ten times costs more than the
notice did.

---

## 1. Say it

`/po/status` → pick a state, write a headline, publish.

| State | Use it when |
|---|---|
| **Operational** | Nothing to report. The notice disappears from the page. |
| **Maintenance** | You are doing something deliberate and it is visible to users. Say when you expect to finish. |
| **Degraded** | It works, but badly, or one feature is broken while the rest is fine. |
| **Outage** | People cannot use the product. |

The headline goes in **the user's terms**: "Investment prices are delayed", not "the live-price edge
function is returning 502". The detail should answer three things — what is affected, what still
works, and **when you will next update this**. A promise to update in an hour is worth more than a
diagnosis.

The page shows whichever is worse: your notice, or what the live checks find. A green notice can
never hide a failing probe, and a green probe can never hide your notice.

## 2. While it is running

- Keep the promise about the next update, even when the update is "no change yet".
- Update the same notice rather than adding a second one — there is one notice, on purpose.
- If people write in, the status page is the answer to link to.

## 3. Close it

Set it back to **Operational** and clear the headline (`Clear the notice` → `Publish`). The page
returns to "nothing is being reported".

Then write down what happened while it is fresh — what broke, how it was noticed, what fixed it, and
what would have caught it sooner — in [Improvement_Roadmap.md](../Improvement_Roadmap.md) or a dated
note. There is no incident log yet; an incident nobody recorded gets re-litigated from memory six
months later.

## What this is not

- **It is not monitoring.** Nothing alerts you; you have to know. Cost and error alerting is roadmap
  5.9, and Sentry (0.5) needs approval as a new service.
- **It is not hosted elsewhere.** The notice lives in the same Postgres as everything else, so a
  total Supabase outage takes the status page's notice with it — the live checks would still render
  and correctly report the API as unreachable, because the page itself is static hosting. A
  third-party status page is the fix if that trade ever stops being acceptable.
- **It has no history.** The page shows what is true now. Past incidents live in whatever you wrote
  down in step 3.

## Where it lives

`src/pages/po/PoStatus.tsx` writes one `site_settings` row (`landing_status`) through the audited
`po_set_site_setting` RPC — no migration. The `landing_` prefix is what makes it readable by a
signed-out visitor; see `src/lib/status.ts` for the worse-of-the-two rule and
`src/hooks/useServiceChecks.ts` for the probes.
