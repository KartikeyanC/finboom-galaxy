import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { DEFAULT_ERROR, toUserMessage } from "./errorMessages";

/**
 * BUG-012: users were shown things like
 * `new row violates row-level security policy for table "transactions"`.
 *
 * Two jobs here: the mapper turns database noise into something actionable,
 * and the last block walks the source tree to prove no call site can put a raw
 * `error.message` in front of a user again.
 */

describe("toUserMessage — messages we wrote ourselves", () => {
  it("passes a RAISE EXCEPTION from our own RPC straight through", () => {
    // P0001 is only ever produced by our SECURITY DEFINER functions.
    expect(toUserMessage({ code: "P0001", message: "Allocation cannot be negative" })).toBe(
      "Allocation cannot be negative",
    );
  });

  it("passes a plain thrown Error through when it reads like product copy", () => {
    expect(toUserMessage(new Error("No workspace selected"))).toBe("No workspace selected");
  });
});

describe("toUserMessage — constraint violations", () => {
  it("explains a duplicate budget by name", () => {
    expect(
      toUserMessage({
        code: "23505",
        message: 'duplicate key value violates unique constraint "budgets_tenant_bucket_period_key"',
      }),
    ).toBe("That bucket already has a budget for this period.");
  });

  it("explains a negative goal amount", () => {
    expect(
      toUserMessage({
        code: "23514",
        message: 'new row for relation "goals" violates check constraint "goals_current_amount_nonneg"',
      }),
    ).toBe("The amount saved cannot be negative.");
  });

  it("explains a transfer without a destination", () => {
    expect(
      toUserMessage({
        code: "23514",
        message: 'violates check constraint "transactions_transfer_dest_check"',
      }),
    ).toContain("destination account");
  });

  it("finds the constraint name in `details` too", () => {
    expect(
      toUserMessage({ code: "23505", message: "duplicate key", details: "Key (code)=(X) already exists in coupons_code_key." }),
    ).toBe("A coupon with that code already exists.");
  });

  it("falls back to a generic line for a constraint it has never heard of", () => {
    const msg = toUserMessage({
      code: "23505",
      message: 'duplicate key value violates unique constraint "some_new_thing_key"',
    });
    expect(msg).toBe("That already exists.");
    expect(msg).not.toContain("some_new_thing_key");
  });
});

describe("toUserMessage — permissions and transport", () => {
  it("translates an RLS refusal without naming the table", () => {
    const msg = toUserMessage({
      code: "42501",
      message: 'new row violates row-level security policy for table "transactions"',
    });
    expect(msg).toBe("You do not have permission to do that.");
    expect(msg).not.toMatch(/transactions|row-level/i);
  });

  it("translates an RLS refusal that arrives as prose only", () => {
    expect(toUserMessage({ message: "new row violates row-level security policy" })).toMatch(
      /permission/i,
    );
  });

  it("says the network is down rather than 'Failed to fetch'", () => {
    expect(toUserMessage(new TypeError("Failed to fetch"))).toMatch(/connection/i);
  });

  it("maps HTTP statuses", () => {
    expect(toUserMessage({ status: 401, message: "" })).toMatch(/sign in/i);
    expect(toUserMessage({ status: 403, message: "" })).toMatch(/permission/i);
    expect(toUserMessage({ status: 429, message: "" })).toMatch(/too many/i);
    expect(toUserMessage({ status: 503, message: "" })).toMatch(/server/i);
  });

  it("maps a missing row", () => {
    expect(toUserMessage({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" })).toBe(
      "That record no longer exists.",
    );
  });
});

describe("toUserMessage — sign-in", () => {
  it("rewrites bad credentials", () => {
    expect(toUserMessage({ message: "Invalid login credentials", status: 400 })).toMatch(
      /email or password is incorrect/i,
    );
  });

  it("rewrites an unconfirmed email", () => {
    expect(toUserMessage({ message: "Email not confirmed" })).toMatch(/confirm your email/i);
  });

  it("rewrites a duplicate signup", () => {
    expect(toUserMessage({ message: "User already registered" })).toMatch(/already exists/i);
  });
});

describe("toUserMessage — fallbacks", () => {
  it("uses the caller's fallback for an unrecognised error", () => {
    expect(toUserMessage({}, "Could not save the goal")).toBe("Could not save the goal");
    expect(toUserMessage(null, "Could not save the goal")).toBe("Could not save the goal");
  });

  it("has a default when the caller gives none", () => {
    expect(toUserMessage(undefined)).toBe(DEFAULT_ERROR);
  });

  it("suppresses a long or leaky message even when the code is unknown", () => {
    expect(toUserMessage({ message: 'relation "tenant_members" does not exist' })).toBe(DEFAULT_ERROR);
    expect(toUserMessage({ message: "x".repeat(200) })).toBe(DEFAULT_ERROR);
  });

  it("accepts a bare string", () => {
    expect(toUserMessage("Pick two different accounts")).toBe("Pick two different accounts");
  });
});

/* ── the guard ─────────────────────────────────────────────────────────── */

const SRC = resolve(__dirname, "..");

function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no raw error text reaches a user", () => {
  const files = sourceFiles().map((path) => ({
    path: relative(SRC, path).replace(/\\/g, "/"),
    text: readFileSync(path, "utf8"),
  }));

  it("finds no toast built from an error's own message", () => {
    // zod's `issues[0].message` is authored validation copy, not a DB error.
    const offenders = files
      .filter((f) => f.path !== "lib/errorMessages.ts")
      .filter((f) =>
        /toast\.error\([^)]*(?<!issues\[0\])\.message/.test(f.text) ||
        /description:\s*\w+\.message/.test(f.text),
      )
      .map((f) => f.path);
    expect(offenders, `raw error.message in a toast: ${offenders.join(", ")}`).toEqual([]);
  });

  it("routes mutation failures through notifyError", () => {
    const offenders = files
      .filter((f) => /onError:/.test(f.text) && !/notifyError/.test(f.text))
      .map((f) => f.path);
    expect(offenders, `onError without notifyError: ${offenders.join(", ")}`).toEqual([]);
  });
});
