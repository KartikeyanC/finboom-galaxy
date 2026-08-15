# Authentication Flow

> Audit date 2026-08-04. Companion: [Authorization_Flow.md](./Authorization_Flow.md),
> [Security_Audit.md](./Security_Audit.md).

FinRoot has **three** authentication paths and **one** additional local gate:

1. Tenant user — Supabase GoTrue email + password
2. Tenant user — Google OAuth via the Lovable Cloud auth SDK
3. Product Owner — identifier + password, **or** identifier + 16-digit secret → magic link
4. All authenticated users — an optional device **PIN** (`ProtectedRoute` + `lib/appLock.ts`), offered on first run and switchable in Settings (Stage 5.4)

---

## 1. Sign-up (tenant)

```
Auth.tsx  ──zod (name, email, password ≥8 ≤72, confirm)
          └─> supabase.auth.signUp({ email, password, data:{ full_name } ,
                                     emailRedirectTo: origin + "/app" })
                    │
             auth.users INSERT
                    │  AFTER INSERT trigger on_auth_user_created
                    ▼
             handle_new_user()  (SECURITY DEFINER)
               ├─ profiles           (id, username?, mobile?, display_name)
               ├─ tenants            ("<name>'s Workspace", created_by)
               ├─ tenant_members     (tenant, user, role='owner', status='active')
               └─ subscriptions      (tenant, plan=Free, status='active', provider='manual')
```

- Email confirmation is a **Supabase project setting**, not code. The UI unconditionally says
  "Check your email to confirm", so behaviour depends on dashboard configuration that is not
  captured in this repo.
- The whole onboarding is atomic in the trigger — good.
- No terms/privacy acceptance is recorded.

## 2. Sign-in (tenant)

`supabase.auth.signInWithPassword` → GoTrue → JWT + refresh token stored in **`localStorage`**
(`createClient(..., { auth: { storage: localStorage, persistSession: true,
autoRefreshToken: true } })`).

On `SIGNED_IN`, `useAuth` calls `markUnlocked(uid)` and `setPasswordAuthNow(uid)` so a fresh
password login skips the PIN prompt and resets the 12-hour window.

**"Saved profiles"** — successful sign-in and opt-in sign-up write `{name, email}` to
`localStorage["valar.profiles"]` (max 8). This is a UX convenience that persists user emails
in cleartext on the device under a legacy key that the `finroots.* → finroot.*` migration
does not cover.

**Dead "remember me":** `useAuth` implements session-only enforcement keyed on
`localStorage["finroot.session_only"]`, but **no code ever sets that key** — `Auth.tsx` only
removes it. The sign-up checkbox labelled *"Remember this profile on this device"* controls only
whether the email is saved. Sessions are therefore always persistent.

## 3. Google OAuth

```
Auth.tsx → lovable.auth.signInWithOAuth("google", { redirect_uri: origin + "/app" })
         → @lovable.dev/cloud-auth-js  → provider → tokens
         → supabase.auth.setSession(result.tokens)
```
The OAuth handshake is brokered by a **third-party SDK** (`@lovable.dev/cloud-auth-js@^1.1.2`)
rather than `supabase.auth.signInWithOAuth`. The token exchange happens outside code in this
repo. This is a supply-chain and trust dependency that should be either documented as accepted
or replaced with the native Supabase flow.

## 4. Password reset

Tenant: `Auth.tsx` dialog → `resetPasswordForEmail(email, { redirectTo: origin + "/reset-password" })`
→ `pages/ResetPassword.tsx` → `auth.updateUser({password})`.
PO: `PoLogin` → `po-auth {mode:"resolve"}` → then the same reset call.

Delivery requires SMTP configured in Supabase. If it is not, reset silently succeeds in the UI
and no mail arrives.

## 5. Product Owner authentication

### 5.1 Password path
```
PoLogin → POST /functions/v1/po-auth { mode:"resolve", identifier }
        → po_resolve_identifier()  [service_role only]
             matches auth.users.email | profiles.username | profiles.mobile
                   | platform_admins.po_user_id | platform_admins.po_number_id
        ← { email }
        → supabase.auth.signInWithPassword({ email, password })
        → rpc is_platform_admin()   ── false → signOut() + error
        → /po
```

### 5.2 Secret path (password-less)
```
PoLogin → POST /functions/v1/po-auth { mode:"secret", identifier, secret }
        → /^[0-9]{16}$/ check
        → po_verify_secret()  → bcrypt compare against platform_admins.secret_hash
        → auth.admin.generateLink({ type:"magiclink", email })
        ← { token_hash }
        → supabase.auth.verifyOtp({ token_hash, type:"magiclink" })
        → full session
```

**Security assessment of the PO paths**

| Property | State |
|---|---|
| Secret storage | ✅ bcrypt (`crypt`/`gen_salt('bf')`, pgcrypto in `extensions`) |
| Secret entropy | 16 digits ≈ 53 bits — adequate *if* rate-limited |
| Rate limiting / lockout | ❌ none |
| Enumeration | ❌ 200 vs 404 on `resolve` identifies PO accounts and leaks the email |
| Second factor | ❌ the secret is an **alternative** to the password, not an additional factor |
| Audit of PO logins | ❌ successful and failed PO sign-ins are **not** written to `audit_log` |
| Function exposure | ✅ `po_resolve_identifier`/`po_verify_secret` revoked from `PUBLIC` |
| Console guard | ✅ `PoShell` checks `is_platform_admin()`; each PO RPC re-checks server-side |

## 6. The PIN gate (`ProtectedRoute` + `appLock.ts`)

```
signed in ──> lockChoice(uid)?
              ├─ "unset" → PinSetup(mode="offer")  → set a PIN, or "Not now" (choice recorded)
              ├─ "off"   → straight into the app, no gate
              └─ "on"
                   │  (no PIN? → PinSetup(mode="reset") — after a password recovery)
                   ▼
             isUnlocked(uid)?  (sessionStorage, per tab)
                   │no
                   ▼
             needsPassword(uid)?   (>12 h since last password login)
              ├─ yes → LockScreen(mode="password") → signInWithPassword
              └─ no  → LockScreen(mode="pin")      → verifyPin
                              └─ "Forgot your PIN?" → password → clearPin → PinSetup("reset")
```
**Stage 5.4.** Hiding the tab records the moment instead of locking; on return
`shouldLockOnReturn()` compares it against the chosen grace period (Immediately / 1 / 5 / 15
minutes, default 5). "Immediately" keeps the old behaviour of locking on the way out, so a
task-switcher preview of the hidden tab shows the lock screen. The custom `finroot:lock` event
(the top-bar **Lock** button) always locks at once and keeps the session alive.

| Property | State |
|---|---|
| Hash | `SHA-256("finroot:<uid>:<pin>")`, **no salt, no iterations** |
| Keyspace | 10⁴–10⁶ → exhaustively searchable in milliseconds from the stored hash |
| Storage | hash in `localStorage`, unlock flag in `sessionStorage` |
| Fail mode | `isUnlocked()` returns **`true`** if storage throws — fail-open |
| Server relevance | none — the Supabase session is fully valid while the app is "locked" |
| Recovery | ✅ Stage 5.4 — "Forgot your PIN?" on the lock screen verifies the account **password**, clears the PIN and asks for a new one (or none). BUG-036 |

The PIN is a shoulder-surfing deterrent, not an access control. Since Stage 5.4 the UI says so
in as many words — on the setup screen and in Settings: it is stored on the device as a one-way
hash, it hides the screen, it does not encrypt anything and it cannot stop someone who has the
password. `needsPassword`/`markUnlocked` are still not security guarantees.

## 7. Session lifecycle

| Event | Behaviour |
|---|---|
| Token refresh | `autoRefreshToken: true` (GoTrue default ~1 h access token) |
| Multiple tabs | session shared via `localStorage`; **unlock state is per tab**, so each new tab re-prompts for the PIN |
| Tab hidden | starts the grace clock; locks on return once it has run out (or at once if the grace is "Immediately"). Session untouched |
| **Lock** button | `recordLogout` + `requestLock` — session kept |
| **Sign out** | `supabase.auth.signOut()` → navigate `/`. PIN hash and saved profiles remain on the device |
| Browser close | session survives (persistent storage) |
| Expiry handling | none explicit — a failed refresh yields `user = null` and a redirect to `/auth`; in-flight queries fail with a raw error toast |

## 8. Checklist results

| Item | Result |
|---|---|
| JWT | ✅ GoTrue HS256, managed |
| Cookies | n/a — token in `localStorage` (⚠️ XSS-readable) |
| Sessions | ✅ managed; ⚠️ always persistent (dead remember-me) |
| Refresh tokens | ✅ rotation handled by GoTrue |
| Password hashing | ✅ bcrypt (GoTrue); PO secret bcrypt |
| OAuth | ⚠️ brokered by a third-party SDK |
| CSRF | ✅ not applicable (bearer token, no cookie auth) |
| XSS | ⚠️ two `dangerouslySetInnerHTML` sites, both on **static, non-user data** (broker help copy; shadcn chart CSS) — no reflected/stored XSS found. But **no CSP header is configured**, so any future injection is unmitigated and would yield the session token |
| CORS | ⚠️ `*` on all edge functions |
| Token expiration | ✅ default |
| Password reset | ✅ implemented; ⚠️ depends on unconfigured SMTP |
| Email verification | ⚠️ depends on a project setting not tracked in the repo |
| MFA readiness | ❌ none; the PO "secret" is an alternative credential, which is weaker than a password alone would be |
| Brute-force protection | ❌ none on `/auth`, none on `po-auth` |
| Session fixation | ✅ GoTrue issues a fresh session |
| Session hijacking | ⚠️ `localStorage` token + no CSP |
| Remember me | ❌ non-functional |
| Logout flow | ⚠️ local artefacts (PIN, saved profiles) survive sign-out |
| Expired-token handling | ⚠️ no graceful path |
| Privilege escalation | ⚠️ see [Authorization_Flow.md](./Authorization_Flow.md) §6 and SEC-001 |

## 9. Recommendations (priority order)

1. Throttle + de-enumerate `po-auth`; audit-log every PO sign-in attempt.
2. Make the 16-digit code a **second** factor on top of the password, or drop it.
3. Add a CSP (`default-src 'self'`, explicit Supabase/Google-Fonts origins) and consider
   moving the session to a cookie-based flow if a server context becomes available.
4. Delete the dead `session_only` branch or wire the checkbox to it honestly.
5. Replace the PIN hash with PBKDF2/scrypt (≥100k iterations, per-user salt) and make
   `isUnlocked` fail **closed**. *(The "forgot PIN → re-enter password" path shipped in 5.4.)*
6. Clear `finroot.pin.*`, `finroot.pwdauth.*` and offer to clear `valar.profiles` on sign-out.
7. Record terms/privacy acceptance at sign-up.
