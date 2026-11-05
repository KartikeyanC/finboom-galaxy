/**
 * BUG-020 — carrying an invitation across sign-in.
 *
 * A signed-out visitor who opens `/invite/:token` is sent to `/auth`. Email
 * sign-in returns them via `location.state.from`, but Google sign-in and the
 * sign-up confirmation email both land on `/app`, so the token is also kept
 * here and `ProtectedRoute` sends them back to the link once they are in.
 *
 * sessionStorage on purpose (see deviceLocal.ts): a join credential belongs to
 * this visit and should not be left on a shared device.
 */
const KEY = "finroot.pendingInvite";

/** Invitation tokens are 32 random bytes as hex (create_invitation). */
const TOKEN = /^[0-9a-f]{64}$/;

export function savePendingInvite(token: string): void {
  if (!TOKEN.test(token)) return;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* private mode — they can re-open the link */
  }
}

export function peekPendingInvite(): string | null {
  try {
    const t = sessionStorage.getItem(KEY);
    return t && TOKEN.test(t) ? t : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
