/**
 * Stage 3.2 / UX-043 — the register of state that deliberately stays on the
 * device, and why.
 *
 * Stage 3.1 moved five features to Postgres because they described SHARED data
 * and so had no business being per-browser. What remains here is the opposite
 * case: state that is genuinely about *this device or this tab*, where syncing
 * it would be wrong rather than merely unnecessary.
 *
 * This file exists so "device-local" is a decision on the record rather than an
 * accident. `deviceLocal.test.ts` scans the source for storage keys and fails
 * on any that are not registered here — which is precisely how BUG-026/071
 * happened: nobody ever decided those five should be device-local, they just
 * never got moved.
 *
 * ⚠️ Nothing here is a security boundary. Anything a user must not be able to
 * change is enforced in RLS, never by a value in their own browser.
 */

export type DeviceLocalEntry = {
  /** Literal key, or a prefix when the key embeds an id. */
  key: string;
  /** True when `key` is a prefix (e.g. `finroot.pin.` + user id). */
  prefix?: boolean;
  /** Which browser store it lives in. */
  store: "local" | "session";
  /** Shown to users where the distinction could mislead them. */
  label: string;
  /** Why syncing this would be wrong, not merely unnecessary. */
  reason: string;
};

export const DEVICE_LOCAL_STATE: readonly DeviceLocalEntry[] = [
  {
    key: "finroot.theme",
    store: "local",
    label: "Theme",
    reason:
      "A display preference tied to the screen you are on — a user may well want dark on a laptop at night and light on a shared desktop.",
  },
  {
    key: "finroot.balances.hidden",
    store: "local",
    label: "Hide balances",
    reason:
      "A privacy shield for the room you are sitting in. Syncing it would un-hide balances on a device where the user deliberately hid them.",
  },
  {
    key: "finroots.dashboard.layout",
    store: "local",
    label: "Dashboard layout",
    reason:
      "Chosen to suit the screen it is viewed on; a phone and a desktop want different layouts for the same workspace.",
  },
  {
    key: "finroot.pwa.installDismissed",
    store: "local",
    label: "Install prompt dismissed",
    reason:
      "A fact about this browser. The app is already installed here, or the user said no here — neither is true of their other devices.",
  },
  {
    key: "finroot.tenant.current",
    store: "local",
    label: "Active workspace",
    reason:
      "Which workspace this browser is currently looking at. Membership is server-side; this is only the last selection.",
  },
  {
    key: "finroot.access.viewAs",
    store: "local",
    label: "Preview as collaborator",
    reason:
      "An owner-only client-side preview (AZ-003). It simulates a narrower menu set for the person looking; it grants nothing and must never be mistaken for one.",
  },
  {
    key: "valar.profiles",
    store: "local",
    label: "Saved sign-in profiles",
    reason:
      "The list of accounts used on this browser, for the sign-in screen. Syncing it would leak who else uses a shared machine.",
  },
  {
    key: "finroot.pin.",
    prefix: true,
    store: "local",
    label: "App-lock PIN",
    reason:
      "A per-device secret, stored as a SHA-256 hash. It must never leave the device — a synced PIN would defeat the point of locking this device.",
  },
  {
    key: "finroot.pinlen.",
    prefix: true,
    store: "local",
    label: "App-lock PIN length",
    reason: "Renders the right number of boxes on the lock screen. Belongs with the PIN.",
  },
  {
    key: "finroot.pwdauth.",
    prefix: true,
    store: "local",
    label: "Last password sign-in",
    reason:
      "Drives the 12-hour re-authentication rule for this device. A different device has its own clock on that.",
  },
  {
    key: "finroot.unlocked.",
    prefix: true,
    store: "session",
    label: "Unlocked for this tab",
    reason:
      "sessionStorage on purpose: a new tab or a reopened browser must prompt again. Persisting it would silently weaken the lock.",
  },
  {
    key: "finroot.lock.pref.",
    prefix: true,
    store: "local",
    label: "App lock on or off",
    reason:
      "Stage 5.4: the lock is a choice about THIS device. Declining it on a desktop at home says nothing about the phone that travels, and syncing the decision would switch the lock off somewhere the user wanted it on.",
  },
  {
    key: "finroot.lock.grace.",
    prefix: true,
    store: "local",
    label: "Lock after",
    reason:
      "How long this device may sit unattended before it locks — a judgement about the room it is in, not about the account. It belongs with the PIN it governs, which never leaves the device either.",
  },
  {
    key: "finroot.lock.hiddenAt.",
    prefix: true,
    store: "session",
    label: "Away since",
    reason:
      "sessionStorage on purpose: the moment THIS tab was hidden, used to apply the grace period on return. It is meaningless in another tab and must not survive the browser closing, or a reopened window could count as still-recently-away.",
  },
  {
    key: "finroot._keysMigrated",
    store: "local",
    label: "Key-rename bookkeeping",
    reason: "Marks the one-time `finroots.` → `finroot.` prefix rename as done on this browser.",
  },
  {
    key: "finroot.ledger.period",
    store: "local",
    label: "Ledger period",
    reason:
      "How much history this device is willing to pull down (Stage 4.2). It is a performance choice about this browser and connection, not a fact about the workspace — a phone on mobile data and a desktop want different answers, and syncing it would impose the slow one on both.",
  },
  {
    key: "finroot.signin.intent",
    store: "session",
    label: "Signing in",
    reason:
      "sessionStorage on purpose, and the reason is the bug it fixes (BUG-090): it records that THIS tab just asked someone for a credential, so `useAuth` can tell a real sign-in from supabase-js restoring a stored session — which it announces with the same event. In localStorage one tab's sign-in would unlock another's.",
  },
  {
    key: "finroot.pendingInvite",
    store: "session",
    label: "Invitation being accepted",
    reason:
      "Carries an invitation token across the sign-in round trip (Stage 3.8). sessionStorage on purpose: an invitation belongs to this visit, and a join credential should not be left sitting on a shared device.",
  },
];

/**
 * Prefixes for keys that are neither app state nor a preference: they record
 * that a one-time localStorage → Postgres import already ran on this browser.
 * They are expected to accumulate and are safe to clear.
 */
export const MIGRATION_FLAG_PREFIXES: readonly string[] = ["finroot.migrated."];

/**
 * Keys read exactly once, by an importer, and never written again — the
 * pre-Postgres remnants of a feature that has since moved to the server.
 * Listing them keeps the audit honest: they are legacy, not live state.
 */
export const LEGACY_IMPORT_ONLY_KEYS: readonly string[] = [
  "finroot.accounts.v1",
  "finroot.trips.v1",
  "networth.entries.v1",
  "networth.history.v1",
  "valar.income.streams",
  // Phase-2 store remnants, surfaced when the scanner learned to resolve
  // `getItem(SOME_CONST)` — the most idiomatic form, and previously invisible:
  "debts.records.v1",
  "insurance.policies.v1",
  "investments.records.v1",
  "reminders.records.v1",
  "subscriptions.records.v1",
  // Stage 3.1's five:
  "custom-categories-v1",
  "expense.custom-subcategories.v1",
  "budgetAllocator.v1",
  "finroot.baseCurrency",
  "finroot.recurring.reminders.v1",
];

export function isRegisteredDeviceLocal(key: string): boolean {
  return DEVICE_LOCAL_STATE.some((e) => (e.prefix ? key.startsWith(e.key) : key === e.key));
}

export function deviceLocalEntry(key: string): DeviceLocalEntry | undefined {
  return DEVICE_LOCAL_STATE.find((e) => (e.prefix ? key.startsWith(e.key) : key === e.key));
}

/** Copy for a UI hint next to a control whose state does not follow the user. */
export const DEVICE_LOCAL_HINT = "Saved on this device only";
