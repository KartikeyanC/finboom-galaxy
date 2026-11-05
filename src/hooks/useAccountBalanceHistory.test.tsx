import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const db = vi.hoisted(() => ({
  setting: null as unknown,
  accounts: ["acc-1"] as string[],
  upserts: [] as { value: unknown }[],
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ currentTenantId: "t1" }) }));
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: db.setting == null ? null : { value: db.setting }, error: null });
    chain.in = async (_c: string, ids: string[]) => ({
      data: ids.filter((i) => db.accounts.includes(i)).map((id) => ({ id })),
      error: null,
    });
    chain.upsert = async (row: { value: unknown }) => {
      if (table !== "tenant_settings") throw new Error("wrong table");
      db.upserts.push(row);
      db.setting = row.value;
      return { error: null };
    };
    return chain;
  };
  return { supabase: { from } };
});

import {
  importLegacy,
  mergeEntries,
  MAX_PER_ACCOUNT,
  useAccountBalanceHistory,
  useSaveBalanceSnapshot,
} from "./useAccountBalanceHistory";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const old = (id: string, account: string, at: string) => ({
  id,
  user_id: "u1",
  account_local_id: account,
  account_name: "HDFC",
  old_balance: 100,
  new_balance: 250,
  note: id === "a" ? "salary" : null,
  created_at: at,
});

beforeEach(() => {
  localStorage.clear();
  db.setting = null;
  db.accounts = ["acc-1"];
  db.upserts = [];
});

describe("mergeEntries", () => {
  it("keeps newest first, drops duplicates, caps per account", () => {
    const e = (id: string, at: string) => ({ id, from: 0, to: 1, at });
    const merged = mergeEntries({ x: [e("1", "2026-01-01")] }, { x: [e("1", "2026-01-01"), e("2", "2026-02-01")] });
    expect(merged.x.map((i) => i.id)).toEqual(["2", "1"]);
    const many = Array.from({ length: MAX_PER_ACCOUNT + 5 }, (_, i) => e(`n${i}`, `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`));
    expect(mergeEntries({}, { x: many }).x).toHaveLength(MAX_PER_ACCOUNT);
  });
});

describe("importLegacy", () => {
  it("moves only this workspace's accounts and leaves the rest for later", async () => {
    localStorage.setItem(
      "finroot.balance_history.u1",
      JSON.stringify([old("a", "acc-1", "2026-10-01T10:00:00Z"), old("b", "acc-other", "2026-10-02T10:00:00Z")]),
    );
    expect(await importLegacy("t1", "u1")).toBe(1);
    expect(db.setting).toEqual({
      "acc-1": [{ id: "a", from: 100, to: 250, note: "salary", at: "2026-10-01T10:00:00Z", by: "u1" }],
    });
    const left = JSON.parse(localStorage.getItem("finroot.balance_history.u1")!);
    expect(left.map((o: { id: string }) => o.id)).toEqual(["b"]);
  });

  it("removes the old key once everything has moved, and is safe to repeat", async () => {
    localStorage.setItem("finroot.balance_history.u1", JSON.stringify([old("a", "acc-1", "2026-10-01T10:00:00Z")]));
    await importLegacy("t1", "u1");
    expect(localStorage.getItem("finroot.balance_history.u1")).toBeNull();
    expect(await importLegacy("t1", "u1")).toBe(0);
    expect(db.upserts).toHaveLength(1);
  });
});

describe("the hooks", () => {
  it("reads an account's history from the workspace setting", async () => {
    db.setting = { "acc-1": [{ id: "x", from: 10, to: 20, at: "2026-11-01T00:00:00Z" }] };
    const { result } = renderHook(() => useAccountBalanceHistory("acc-1"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data![0]).toMatchObject({ old_balance: 10, new_balance: 20, note: null });
  });

  it("saving adds to what the server has now, not to a stale copy", async () => {
    db.setting = { "acc-1": [{ id: "x", from: 10, to: 20, at: "2026-11-01T00:00:00Z" }] };
    const { result } = renderHook(() => useSaveBalanceSnapshot(), { wrapper });
    // Another device writes in between.
    db.setting = {
      "acc-1": [
        { id: "y", from: 20, to: 30, at: "2026-11-02T00:00:00Z" },
        { id: "x", from: 10, to: 20, at: "2026-11-01T00:00:00Z" },
      ],
    };
    await act(() =>
      result.current.mutateAsync({ account_local_id: "acc-1", account_name: "HDFC", old_balance: 30, new_balance: 45 }),
    );
    const saved = (db.setting as Record<string, { to: number }[]>)["acc-1"];
    expect(saved.map((e) => e.to)).toEqual([45, 30, 20]);
  });
});
