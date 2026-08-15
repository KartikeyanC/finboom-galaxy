import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import {
  PRIVACY_CONTACT,
  SUPPORT_EMAIL,
  supportDiagnostics,
  supportMailto,
} from "./support";

/**
 * Stage 5.7. The address was in three places, all of them a placeholder on a
 * domain with no mailbox (BUG-073) — including the one the privacy policy
 * offers for a data-rights request. These tests keep it in one place and keep
 * it real.
 */

const SRC = resolve(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

describe("the support address", () => {
  it("is a real, deliverable address rather than a placeholder", () => {
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    // The three placeholders this stage removed. A domain with no mailbox turns
    // every "contact us" in the product into a dead end.
    expect(SUPPORT_EMAIL).not.toMatch(/@finroot\.app$/i);
    expect(SUPPORT_EMAIL).not.toMatch(/example\.com|test\.com|localhost/i);
  });

  it("is the one the privacy policy uses, so a rights request reaches someone", () => {
    expect(PRIVACY_CONTACT).toBe(SUPPORT_EMAIL);
  });

  it("is the only contact address written into the source", () => {
    // Anything else is a copy that will be forgotten the day the address moves.
    //
    // Input placeholders ("you@company.com" in a sign-in field) are exempt:
    // they are example text for the user's OWN address, not somewhere we ask
    // anyone to write to.
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const rel = relative(SRC, f).replace(/\\/g, "/");
      if (rel === "lib/support.ts") continue;
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (/placeholder/i.test(line)) continue;
        const m = line.match(/["'`]([\w.+-]+@[\w.-]+\.[a-z]{2,})["'`]/i);
        if (m) offenders.push(`${rel}: ${m[1]}`);
      }
    }
    expect(offenders, "import SUPPORT_EMAIL from lib/support.ts instead").toEqual([]);
  });

  it("leaves no placeholder domain anywhere in the app", () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const rel = relative(SRC, f).replace(/\\/g, "/");
      const src = readFileSync(f, "utf8");
      // `finroot.app` as an EMAIL domain only — the marketing copy may still
      // talk about the site itself.
      if (/[\w.+-]+@finroot\.app/i.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("the diagnostics block", () => {
  const full = {
    email: "someone@example.com",
    userId: "user-1",
    workspaceId: "tenant-1",
    workspaceName: "Home",
    planName: "Canopy",
    path: "/app/investments",
    build: "2026-08-12 09:30 UTC",
    userAgent: "Mozilla/5.0",
  };

  it("includes the ids a reply actually needs", () => {
    const d = supportDiagnostics(full);
    expect(d).toContain("User id: user-1");
    expect(d).toContain("Workspace id: tenant-1");
    expect(d).toContain("Plan: Canopy");
    expect(d).toContain("Page: /app/investments");
  });

  it("omits what it does not have rather than writing empty labels", () => {
    const d = supportDiagnostics({ email: "a@b.co", userId: null, planName: "  " });
    expect(d).toBe("Account: a@b.co");
  });

  it("is empty for a signed-out visitor", () => {
    expect(supportDiagnostics({})).toBe("");
  });

  it("carries no financial data — only identity and environment", () => {
    // A support mail must never become an accidental export of someone's money.
    const d = supportDiagnostics(full).toLowerCase();
    for (const word of ["amount", "balance", "transaction", "₹", "salary"]) {
      expect(d).not.toContain(word);
    }
  });
});

describe("the mailto", () => {
  it("goes to the support address with a subject and a place to type", () => {
    const href = supportMailto({ subject: "Help", context: { userId: "u1" } });
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("subject=Help");
    expect(decoded).toContain("User id: u1");
  });

  it("encodes the body, so a newline or an ampersand cannot truncate it", () => {
    const href = supportMailto({ intro: "a & b", context: { planName: "Roots" } });
    expect(href).not.toContain("a & b");
    expect(decodeURIComponent(href)).toContain("a & b");
  });

  it("works with no context at all", () => {
    expect(supportMailto()).toContain(`mailto:${SUPPORT_EMAIL}`);
  });
});
