import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * BUG-040 was not a typo — it was a shape of code: read a number in the
 * browser, add to it, write the sum back. Two people saving at once, or one
 * person with two tabs, and a deposit vanishes.
 *
 * `goal_contribute` and `budget_set_allocation` fixed it by making the change
 * one locked statement on the server. These tests guard the shape, so the
 * pattern cannot quietly return in a later edit.
 */

const SRC = resolve(__dirname, "..");

function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = sourceFiles().map((path) => ({
  path: relative(SRC, path).replace(/\\/g, "/"),
  text: readFileSync(path, "utf8"),
}));

/** Files whose `.from("<table>")` chain reaches a write within a few lines. */
function directWritersOf(table: string): string[] {
  const pattern = new RegExp(
    String.raw`\.from\(\s*["']${table}["']\s*\)[\s\S]{0,240}?\.(insert|update|upsert)\(`,
    "g",
  );
  return FILES.filter((f) => pattern.test(f.text)).map((f) => f.path);
}

describe("budget writes", () => {
  it("all go through budget_set_allocation, never a direct insert or update", () => {
    expect(directWritersOf("budgets")).toEqual([]);
  });

  it("useBudgets calls the RPC", () => {
    const hook = FILES.find((f) => f.path === "hooks/useBudgets.ts");
    expect(hook, "hooks/useBudgets.ts is missing").toBeTruthy();
    expect(hook!.text).toContain("budget_set_allocation");
  });

  it("no longer exposes the separate create/update hooks the RPC replaced", () => {
    const hook = FILES.find((f) => f.path === "hooks/useBudgets.ts")!;
    expect(hook.text).not.toContain("export function useCreateBudget");
    expect(hook.text).not.toContain("export function useUpdateBudget");
  });

  it("keeps the derived `spent` column out of the write shape", () => {
    // Since roadmap 2.4 spend is derived from transactions; accepting it from a
    // client would resurrect a number that drifts from the ledger.
    const hook = FILES.find((f) => f.path === "hooks/useBudgets.ts")!;
    const input = hook.text.match(/interface BudgetInput \{[\s\S]*?\}/)?.[0] ?? "";
    expect(input, "BudgetInput not found").not.toBe("");
    expect(input).not.toMatch(/\bspent\b/);
    // …and nothing passes it to the RPC either.
    const rpcCall = hook.text.match(/rpc\(\s*["']budget_set_allocation["'][\s\S]*?\}\)/)?.[0] ?? "";
    expect(rpcCall).not.toMatch(/\bspent\b/);
  });
});

describe("goal contributions", () => {
  it("compute no new balance in the browser", () => {
    // e.g. `current_amount: Number(goal.current_amount) + amt` — the exact
    // read-modify-write that lost deposits.
    const arithmetic = FILES.filter((f) => /current_amount:\s*[^,;\n]*[+-]\s/.test(f.text)).map(
      (f) => f.path,
    );
    expect(arithmetic).toEqual([]);
  });

  it("go through the goal_contribute RPC", () => {
    const hook = FILES.find((f) => f.path === "hooks/useGoals.ts")!;
    expect(hook.text).toContain("goal_contribute");
    const manager = FILES.find((f) => f.path === "components/goals/GoalManager.tsx")!;
    expect(manager.text).toContain("useContributeToGoal");
  });
});

describe("billing calls", () => {
  it("always name the workspace, so the function never has to guess (BUG-023)", () => {
    const billing = FILES.find((f) => f.path === "pages/Billing.tsx")!;
    const invocations = billing.text.match(/functions\.invoke\(\s*["']billing-api["'][\s\S]{0,260}?\}\)/g) ?? [];
    expect(invocations.length).toBeGreaterThan(0);
    for (const call of invocations) {
      expect(call, `billing-api call without a tenant: ${call}`).toMatch(
        /x-tenant-id|tenant_id: currentTenantId/,
      );
    }
  });
});

describe("account linkage lives in columns, not prose (Stage 3.4 / BUG-039)", () => {
  it("no writer glues a [Mode|accountId] prefix onto a description", () => {
    // The encoding it replaced had no referential integrity: deleting an
    // account left a dangling uuid inside free text, and every balance in the
    // app was produced by regexing prose in the browser.
    const offenders = FILES.filter((f) => /`\[\$\{[^}]+\}\|/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the dialogs that create account-linked transactions set account_id", () => {
    for (const path of [
      "components/transactions/TransactionDialog.tsx",
      "components/transactions/TransferDialog.tsx",
      "components/investments/DematFundDialog.tsx",
    ]) {
      const file = FILES.find((f) => f.path === path);
      expect(file, `missing ${path}`).toBeTruthy();
      expect(file!.text, `${path} must set account_id`).toContain("account_id");
    }
  });

  it("a transfer names both of its ends", () => {
    // Source and destination are both columns since 3.4; before it, only the
    // destination was, and the source rode in the description.
    const dialog = FILES.find((f) => f.path === "components/transactions/TransferDialog.tsx")!;
    expect(dialog.text).toContain("account_id: fromId");
    expect(dialog.text).toContain("transfer_to_account_id: toId");
  });

  it("balance maths reads the column first", () => {
    const lib = FILES.find((f) => f.path === "lib/accountBalances.ts")!;
    expect(lib.text).toContain("txn.account_id ??");
  });
});
