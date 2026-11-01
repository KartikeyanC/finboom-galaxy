/**
 * Is a social sign-in provider switched on for this Supabase project?
 *
 * Supabase answers a sign-in for a disabled provider with a raw JSON error
 * page ("Unsupported provider: provider is not enabled") on its own domain,
 * after the browser has already left the app. Asking first lets the sign-in
 * page say so in a toast instead.
 *
 * `/auth/v1/settings` is public — it needs only the publishable key the client
 * already ships. Returns `null` when the answer is unknown (offline, blocked,
 * an unexpected shape): callers should then try the sign-in anyway rather than
 * refuse a provider that may well work.
 */
export type OAuthProvider = "google";

export function providerEnabled(settings: unknown, provider: OAuthProvider): boolean | null {
  if (!settings || typeof settings !== "object") return null;
  const external = (settings as { external?: unknown }).external;
  if (!external || typeof external !== "object") return null;
  const value = (external as Record<string, unknown>)[provider];
  return typeof value === "boolean" ? value : null;
}

export async function isOAuthProviderEnabled(
  provider: OAuthProvider,
  url: string = import.meta.env.VITE_SUPABASE_URL,
  key: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  try {
    const res = await fetchImpl(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return null;
    return providerEnabled(await res.json(), provider);
  } catch {
    return null;
  }
}
