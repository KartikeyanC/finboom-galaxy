import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetOAuthReturnError, parseOAuthReturnError, stashOAuthReturnError, takeOAuthReturnError,
} from "./oauthReturn";

describe("parseOAuthReturnError", () => {
  it("is null for a normal URL and for a successful return — a token must never be mistaken for an error", () => {
    expect(parseOAuthReturnError("", "")).toBeNull();
    expect(parseOAuthReturnError("#access_token=abc&refresh_token=def&token_type=bearer", "")).toBeNull();
  });

  it("reads the error from the hash, where the implicit flow puts it", () => {
    const r = parseOAuthReturnError("#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed", "");
    expect(r?.copy).toMatch(/can't be created/i);
    expect(r?.detail).toBe("Signups not allowed");
  });

  it("reads the error from the query string, where the PKCE flow puts it", () => {
    const r = parseOAuthReturnError("", "?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user");
    expect(r?.copy).toMatch(/set up your account/i);
    expect(r?.detail).toBe("Database error saving new user");
  });

  it("blames the provider setup, not the visitor, when the code exchange fails — and drops the one-time code", () => {
    const r = parseOAuthReturnError("#error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code%3A+4%2F0AabC", "");
    expect(r?.copy).toMatch(/isn't working right now/i);
    expect(r?.detail).toBe("Unable to exchange external code");
  });

  it("says something useful for a cancelled consent screen and for an unknown error", () => {
    expect(parseOAuthReturnError("#error=access_denied&error_description=The+user+denied", "")?.copy).toMatch(/cancelled/i);
    expect(parseOAuthReturnError("#error=weird", "")?.copy).toMatch(/didn't finish/i);
  });
});

describe("stash / take", () => {
  beforeEach(() => _resetOAuthReturnError());

  it("hands the copy over exactly once", () => {
    stashOAuthReturnError({ hash: "#error=access_denied", search: "", pathname: "/app" });
    expect(takeOAuthReturnError()?.copy).toMatch(/cancelled/i);
    expect(takeOAuthReturnError()).toBeNull();
  });

  it("stores nothing when there is no error", () => {
    stashOAuthReturnError({ hash: "#access_token=abc", search: "", pathname: "/app" });
    expect(takeOAuthReturnError()).toBeNull();
  });
});
