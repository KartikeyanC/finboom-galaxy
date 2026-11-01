/**
 * What a failed social sign-in leaves behind, and how to say it out loud.
 *
 * When Google (or Supabase after it) refuses, the browser comes back to the
 * `redirectTo` page — `/app` — with the reason in the URL:
 *
 *   /app#error=access_denied&error_code=signup_disabled&error_description=...
 *
 * `ProtectedRoute` sees no user, redirects to `/auth`, and the new URL has no
 * hash. The person lands on a bare sign-in page with no hint that anything
 * went wrong — which is exactly how this was reported ("it doesn't open the
 * dashboard, it shows the sign-in page again").
 *
 * So `stashOAuthReturnError()` runs once, before React renders, and keeps the
 * reason in a module variable. A plain variable is enough: `/app` → `/auth` is
 * a client-side navigation inside the same page load. (It is deliberately NOT
 * a storage key — `deviceLocal.test.ts` makes every one of those justify
 * itself, and nothing here needs to survive a reload.)
 *
 * A successful return carries `#access_token=...` instead, which supabase-js
 * must be left to read — this never touches a URL without an `error`.
 */

export type OAuthReturnError = {
  /** Authored copy — the only text a visitor is shown. */
  copy: string;
  /** The provider's own wording. For the console and dev builds, never for visitors. */
  detail?: string;
};

type Parts = { error?: string; code?: string; description?: string };

function read(params: URLSearchParams): Parts {
  const error = params.get("error") ?? undefined;
  if (!error) return {};
  return {
    error,
    code: params.get("error_code") ?? undefined,
    description: params.get("error_description") ?? undefined,
  };
}

/** Pure: pull an OAuth error out of a hash and/or query string, if there is one. */
export function parseOAuthReturnError(hash: string, search: string): OAuthReturnError | null {
  const fromHash = read(new URLSearchParams(hash.replace(/^#/, "")));
  const fromQuery = read(new URLSearchParams(search.replace(/^\?/, "")));
  const p = fromHash.error ? fromHash : fromQuery;
  if (!p.error) return null;

  const text = `${p.code ?? ""} ${p.description ?? ""}`.toLowerCase();
  let copy: string;
  if (text.includes("exchange external code")) {
    // Supabase could not trade Google's code for tokens: the provider's Client
    // ID / secret in the Supabase dashboard are wrong. Nothing the visitor did.
    copy = "Google sign-in isn't working right now. Please sign in with your email and password.";
  } else if (p.code === "signup_disabled" || text.includes("signups not allowed")) {
    copy = "New accounts can't be created with Google right now. Please sign in with your email and password.";
  } else if (text.includes("database error saving new user") || p.code === "unexpected_failure") {
    copy = "We couldn't set up your account from Google. Please try again, or sign up with your email.";
  } else if (p.error === "access_denied") {
    copy = "Google sign-in was cancelled or isn't allowed for this account. Please try again, or use your email and password.";
  } else {
    copy = "Google sign-in didn't finish. Please try again, or use your email and password.";
  }
  // The one-time code that follows "external code" is dropped from the detail.
  const detail = (p.description ?? p.error)?.replace(/(exchange external code).*$/i, "$1");
  return { copy, detail };
}

let pending: OAuthReturnError | null = null;

/** Call once at startup, before the router can redirect and drop the URL. */
export function stashOAuthReturnError(loc: Pick<Location, "hash" | "search" | "pathname"> = window.location): void {
  const found = parseOAuthReturnError(loc.hash, loc.search);
  if (!found) return;
  pending = found;
  // The error text is not something to leave sitting in the address bar or the
  // history entry. Only reached when there IS an error, so a token is never cut.
  try { window.history.replaceState(null, "", loc.pathname); } catch { /* best effort */ }
}

/** Read-and-clear, so the message is shown exactly once. */
export function takeOAuthReturnError(): OAuthReturnError | null {
  const out = pending;
  pending = null;
  return out;
}

/** Test seam. */
export function _resetOAuthReturnError(): void {
  pending = null;
}
