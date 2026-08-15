# Paddle Setup (Phase 7 self-serve billing)

The code is complete and deployed. Billing won't charge anyone until you connect
your own Paddle account. Do this in **sandbox** first, then repeat for **live**.

## 1. Create products & prices (Paddle dashboard → Catalog)
- Create a product (e.g. "FinRoot Pro").
- Add a **recurring price** (e.g. $9 / month). Copy its **Price ID** (`pri_...`).

## 2. Map the price to your plan
Set `paddle_price_id` on the matching row in the `plans` table:
```sql
update public.plans set paddle_price_id = 'pri_xxx' where name = 'Pro';
```
Only plans with `price_cents > 0` AND a non-null `paddle_price_id` show up as
upgrade options (`upgradeable_plans()` / the Billing page "Plans" card).

## 3. Client-side checkout token
`.env.development` already has `VITE_PAYMENTS_CLIENT_TOKEN`. Make sure it is your
Paddle **client-side token** (sandbox token starts with `test_`, live with `live_`).
The Billing page auto-selects sandbox vs production from that prefix.

## 4. Edge function secrets (Supabase → Project Settings → Edge Functions → Secrets,
or `supabase secrets set --project-ref hkfwuxqeexamyphcgkxr`)
- `PADDLE_SANDBOX_API_KEY` — server API key (used by `billing-api` for cancel/resume/invoices).
- `PAYMENTS_SANDBOX_WEBHOOK_SECRET` — webhook signing secret (used by `payments-webhook`).
- (live equivalents: `PADDLE_LIVE_API_KEY`, `PAYMENTS_LIVE_WEBHOOK_SECRET`.)
- Optional email: `RESEND_API_KEY` (+ `EMAIL_FROM`) to enable `send-email`.

## 5. Point Paddle's webhook at the function
In Paddle → Developer Tools → Notifications, add a destination:
```
https://hkfwuxqeexamyphcgkxr.supabase.co/functions/v1/payments-webhook?env=sandbox
```
Subscribe to `subscription.*` events. The function verifies the signature with
`PAYMENTS_SANDBOX_WEBHOOK_SECRET`, resolves the tenant from the checkout's
`custom_data.tenant_id`, maps the price to a plan, and upserts the tenant's
subscription row (one row per tenant — the signup Free row is upgraded in place).

## 6. Test the loop
1. Open the app → Billing → "Upgrade to Pro" → complete Paddle sandbox checkout.
2. Webhook fires → `subscriptions` row for the tenant becomes plan=Pro, provider=paddle.
3. `get_effective_menus` now returns the Pro menu set; the expired banner clears.

## Notes
- `billing-api` (cancel/resume/invoice PDF) and `payments-webhook` are already
  deployed to the dev project. Redeploy after edits with:
  `supabase functions deploy <name> --project-ref hkfwuxqeexamyphcgkxr --workdir <repo>`
  (add `--no-verify-jwt` for `payments-webhook`).
- Going live: repeat steps 1–5 with live product/price/keys and `?env=live`.
