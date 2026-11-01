/**
 * The FinRoot Windows app (windows-installer/dashboard) runs this dashboard
 * inside a WebView2 window and announces itself as `window.finrootDesktop`
 * before any page script runs.
 *
 * Google won't show its sign-in page inside an app's web view, and the
 * answer would come back to the website's address, not the window's. So in
 * the app, "Continue with Google" asks Supabase for the sign-in URL without
 * leaving the page, hands it to the host to open in the person's own
 * browser, and the host later posts Google's answer (the `#access_token=…`
 * fragment Supabase sent the browser back with) into this same page. The
 * page stays put the whole time, so the sign-in intent marker in
 * sessionStorage (see appLock) is still there when the session arrives.
 */
export interface DesktopHost {
  /** Where Supabase sends the browser back to: http://127.0.0.1:<port>/finroot-signin */
  redirectTo: string;
  /** Opens a URL in the person's default browser. */
  openInBrowser: (url: string) => void;
}

/** WebView2's message event: only `data` matters here. */
interface WebViewMessageEvent {
  data?: unknown;
}

interface WebViewBridge {
  postMessage: (message: unknown) => void;
  addEventListener: (type: "message", listener: (e: WebViewMessageEvent) => void) => void;
  removeEventListener: (type: "message", listener: (e: WebViewMessageEvent) => void) => void;
}

declare global {
  interface Window {
    finrootDesktop?: DesktopHost;
    chrome?: { webview?: WebViewBridge };
  }
}

/** The host, when this page is inside the Windows app; null on the website. */
export function desktopHost(): DesktopHost | null {
  if (typeof window === "undefined") return null;
  const h = window.finrootDesktop;
  if (!h || typeof h.openInBrowser !== "function") return null;
  if (!/^http:\/\/127\.0\.0\.1:\d+\/finroot-signin$/.test(h.redirectTo ?? "")) return null;
  return h;
}

/**
 * Calls `handler` with the fragment (or query) Google's redirect came back
 * with — `#access_token=…&refresh_token=…` or `#error=…` — each time the
 * host relays one. Returns the unsubscribe function.
 */
export function onGoogleReturn(handler: (fragment: string) => void): () => void {
  const bridge = typeof window === "undefined" ? undefined : window.chrome?.webview;
  if (!bridge) return () => {};
  const listener = (e: WebViewMessageEvent) => {
    const d = e.data as { type?: unknown; fragment?: unknown } | undefined;
    if (d?.type === "google-return" && typeof d.fragment === "string") handler(d.fragment);
  };
  bridge.addEventListener("message", listener);
  return () => bridge.removeEventListener("message", listener);
}

/** The tokens or the error in a Supabase implicit-flow return fragment. */
export function parseGoogleReturn(fragment: string): {
  accessToken?: string;
  refreshToken?: string;
  error?: string;
} {
  const p = new URLSearchParams(fragment.replace(/^[#?]/, ""));
  const error = p.get("error_description") ?? p.get("error") ?? undefined;
  if (error) return { error };
  const accessToken = p.get("access_token") ?? undefined;
  const refreshToken = p.get("refresh_token") ?? undefined;
  if (!accessToken || !refreshToken) return { error: "Google sign-in did not finish." };
  return { accessToken, refreshToken };
}
