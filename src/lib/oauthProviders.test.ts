import { describe, expect, it } from "vitest";

import { isOAuthProviderEnabled, providerEnabled } from "./oauthProviders";

const reply = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("providerEnabled", () => {
  it("reads the flag from Supabase's settings shape", () => {
    expect(providerEnabled({ external: { google: true, email: true } }, "google")).toBe(true);
    expect(providerEnabled({ external: { google: false, email: true } }, "google")).toBe(false);
  });

  it("is unknown — never false — when the shape is not what we expect", () => {
    expect(providerEnabled(null, "google")).toBeNull();
    expect(providerEnabled({}, "google")).toBeNull();
    expect(providerEnabled({ external: { email: true } }, "google")).toBeNull();
    expect(providerEnabled({ external: { google: "yes" } }, "google")).toBeNull();
  });
});

describe("isOAuthProviderEnabled", () => {
  it("returns the server's answer", async () => {
    await expect(isOAuthProviderEnabled("google", "https://x", "k", reply({ external: { google: false } }))).resolves.toBe(false);
    await expect(isOAuthProviderEnabled("google", "https://x", "k", reply({ external: { google: true } }))).resolves.toBe(true);
  });

  it("treats an HTTP error or a network failure as unknown, so sign-in is still attempted", async () => {
    await expect(isOAuthProviderEnabled("google", "https://x", "k", reply({}, false))).resolves.toBeNull();
    const boom = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(isOAuthProviderEnabled("google", "https://x", "k", boom)).resolves.toBeNull();
  });
});
