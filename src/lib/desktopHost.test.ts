import { afterEach, describe, expect, it, vi } from "vitest";
import { desktopHost, onGoogleReturn, parseGoogleReturn } from "./desktopHost";

describe("desktopHost", () => {
  afterEach(() => {
    delete window.finrootDesktop;
    delete window.chrome;
  });

  it("is null on the website", () => {
    expect(desktopHost()).toBeNull();
  });

  it("returns the host the Windows app announces", () => {
    const openInBrowser = () => {};
    window.finrootDesktop = { redirectTo: "http://127.0.0.1:48271/finroot-signin", openInBrowser };
    expect(desktopHost()?.redirectTo).toBe("http://127.0.0.1:48271/finroot-signin");
  });

  it("ignores a host whose redirect is not the loopback sign-in address", () => {
    window.finrootDesktop = { redirectTo: "https://evil.example/x", openInBrowser: () => {} };
    expect(desktopHost()).toBeNull();
  });

  it("relays the host's google-return message and unsubscribes", () => {
    const listeners: Array<(e: { data?: unknown }) => void> = [];
    window.chrome = {
      webview: {
        postMessage: () => {},
        addEventListener: (_t, l) => listeners.push(l),
        removeEventListener: (_t, l) => listeners.splice(listeners.indexOf(l), 1),
      },
    };
    const handler = vi.fn();
    const off = onGoogleReturn(handler);
    listeners.forEach((l) => l({ data: { type: "other" } }));
    listeners.forEach((l) => l({ data: { type: "google-return", fragment: "#access_token=a&refresh_token=r" } }));
    expect(handler).toHaveBeenCalledWith("#access_token=a&refresh_token=r");
    off();
    expect(listeners).toHaveLength(0);
  });

  it("does nothing on the website, where there is no host bridge", () => {
    expect(() => onGoogleReturn(() => {})()).not.toThrow();
  });
});

describe("parseGoogleReturn", () => {
  it("reads the tokens", () => {
    expect(parseGoogleReturn("#access_token=a.b.c&refresh_token=r&token_type=bearer")).toEqual({
      accessToken: "a.b.c",
      refreshToken: "r",
    });
  });

  it("prefers Google's own wording for a refusal", () => {
    expect(parseGoogleReturn("#error=access_denied&error_description=Signups+not+allowed")).toEqual({
      error: "Signups not allowed",
    });
    expect(parseGoogleReturn("?error=server_error")).toEqual({ error: "server_error" });
  });

  it("treats a fragment without tokens as unfinished", () => {
    expect(parseGoogleReturn("#foo=bar").error).toMatch(/did not finish/);
  });
});
