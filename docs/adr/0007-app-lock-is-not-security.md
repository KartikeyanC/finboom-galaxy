# ADR-0007 — The app lock is a curtain, not an access control

**Status:** Accepted (2026-08-11, roadmap 5.4 · supersedes the mandatory-PIN behaviour of Phase 6).

## Context

The app had a device PIN: mandatory, four or six digits, hashed with a single unsalted SHA-256 pass
into `localStorage`, re-prompting on every tab switch, with no reset path. A forgotten PIN meant
clearing site data, which for most people is indistinguishable from losing the account.

None of it protected anything. The Supabase session stays completely valid while the app is
"locked"; a keyspace of 10⁴–10⁶ is exhaustively searchable from the stored hash in milliseconds; and
`isUnlocked()` fails **open** if storage throws. Meanwhile the friction was teaching people to pick
1111 so they could type it forty times a day.

## Decision

State plainly what the lock is: **it hides the screen of a device somebody is already signed in on.**
It does not encrypt anything and cannot stop someone who has the password. RLS is what protects the
data. That sentence appears on the setup screen and in Settings, because a lock people trust further
than it goes is worse than no lock.

Given that, the lock is **optional** (offered on first run, declinable, switchable in Settings),
leaving the tab starts a **grace period** rather than locking instantly (Immediately / 1 / 5 / 15
minutes, default 5), and a forgotten PIN is **reset with the account password** — the credential
that actually proves something.

## Consequences

- Declining the lock means an unattended, signed-in browser shows the data. That is the user's
  choice to make, and the confirmation says exactly that rather than hiding it.
- "Immediately" is kept and still locks on the way *out*, so a task-switcher preview of the hidden
  tab shows the lock screen rather than balances.
- The stronger hash (PBKDF2/scrypt, per-user salt) and making `isUnlocked()` fail closed remain
  open items. They are worth doing, but they change nothing about what the lock is *for*.
- Because the PIN never leaves the device, it is not in any backup or export, and it does not follow
  the user to another device. Said out loud in the UI for the same reason as everything above.

## Where it lives

`src/lib/appLock.ts`, `src/hooks/useLockSettings.ts`, `src/components/{ProtectedRoute,LockScreen,PinSetup}.tsx`,
`src/components/settings/AppLockSettings.tsx`, and BR-062…066 in
[Business_Rules.md](../Business_Rules.md).
