import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import type { BalanceEntry, BalanceHistorySetting } from "@/lib/tenantSettings";

/**
 * Each account's manual balance edits — the timeline in BalanceHistorySheet.
 *
 * Kept in the workspace's `balance_history` setting (tenant_settings), so it
 * follows the workspace across devices and members. Until 2026-11-05 it lived
 * in this browser's localStorage under the user's id: history recorded on a
 * phone never reached the web, and clearing the browser lost it. Anything left
 * under the old key is brought across the first time a workspace that owns
 * those accounts loads (see `importLegacy`).
 */

export interface BalanceSnapshot {
  id: string;
  account_local_id: string;
  old_balance: number;
  new_balance: number;
  note: string | null;
  created_at: string;
}

const KEY = "balance_history";
/** Enough for years of monthly updates; keeps the one row small. */
export const MAX_PER_ACCOUNT = 200;
const legacyKey = (userId: string) => `finroot.balance_history.${userId}`;
const queryKey = (tenantId: string | null) => ["tenant-setting", KEY, tenantId] as const;

async function readSetting(tenantId: string): Promise<BalanceHistorySetting> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  return (data?.value as unknown as BalanceHistorySetting | null) ?? {};
}

async function writeSetting(tenantId: string, value: BalanceHistorySetting, by?: string) {
  const { error } = await supabase.from("tenant_settings").upsert(
    { tenant_id: tenantId, key: KEY, value: value as unknown as Json, updated_by: by ?? null },
    { onConflict: "tenant_id,key" },
  );
  if (error) throw error;
}

/** Adds entries per account, newest first, without duplicates, capped. */
export function mergeEntries(
  current: BalanceHistorySetting,
  add: Record<string, BalanceEntry[]>,
): BalanceHistorySetting {
  const next: BalanceHistorySetting = { ...current };
  for (const [account, entries] of Object.entries(add)) {
    const seen = new Set((next[account] ?? []).map((e) => e.id));
    next[account] = [...(next[account] ?? []), ...entries.filter((e) => !seen.has(e.id))]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, MAX_PER_ACCOUNT);
  }
  return next;
}

const toSnapshot = (account: string) => (e: BalanceEntry): BalanceSnapshot => ({
  id: e.id,
  account_local_id: account,
  old_balance: e.from,
  new_balance: e.to,
  note: e.note ?? null,
  created_at: e.at,
});

/** The whole workspace's history; brings this browser's old copy across once. */
function useHistory() {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKey(currentTenantId),
    enabled: !!currentTenantId,
    queryFn: () => readSetting(currentTenantId as string),
  });

  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (!currentTenantId || !user || !query.isSuccess) return;
    const marker = `${currentTenantId}:${user.id}`;
    if (tried.current === marker) return;
    tried.current = marker;
    void importLegacy(currentTenantId, user.id).then((moved) => {
      if (moved) qc.invalidateQueries({ queryKey: queryKey(currentTenantId) });
    });
  }, [currentTenantId, user, query.isSuccess, qc]);

  return query;
}

/**
 * Moves this browser's old per-user history into the workspace that owns the
 * accounts. Only entries for this workspace's accounts move; the rest stay
 * until a workspace that owns them is opened, and the old key is removed once
 * it is empty. Returns how many entries moved.
 */
export async function importLegacy(tenantId: string, userId: string): Promise<number> {
  type Old = {
    id: string;
    account_local_id: string;
    old_balance: number;
    new_balance: number;
    note: string | null;
    created_at: string;
  };
  let old: Old[];
  try {
    const raw = localStorage.getItem(legacyKey(userId));
    if (!raw) return 0;
    old = JSON.parse(raw) as Old[];
    if (!Array.isArray(old)) return 0;
  } catch {
    return 0;
  }
  if (old.length === 0) {
    localStorage.removeItem(legacyKey(userId));
    return 0;
  }

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", [...new Set(old.map((o) => o.account_local_id))]);
  if (error || !accounts?.length) return 0;
  const mine = new Set(accounts.map((a) => a.id));

  const add: Record<string, BalanceEntry[]> = {};
  for (const o of old) {
    if (!mine.has(o.account_local_id)) continue;
    (add[o.account_local_id] ??= []).push({
      id: o.id,
      from: Number(o.old_balance),
      to: Number(o.new_balance),
      ...(o.note ? { note: o.note } : {}),
      at: o.created_at,
      by: userId,
    });
  }
  const moved = Object.values(add).reduce((n, list) => n + list.length, 0);
  if (moved === 0) return 0;

  try {
    await writeSetting(tenantId, mergeEntries(await readSetting(tenantId), add), userId);
  } catch {
    return 0; // try again next load; nothing was removed
  }
  const rest = old.filter((o) => !mine.has(o.account_local_id));
  if (rest.length) localStorage.setItem(legacyKey(userId), JSON.stringify(rest));
  else localStorage.removeItem(legacyKey(userId));
  return moved;
}

/** One account's balance edits, newest first. */
export function useAccountBalanceHistory(accountLocalId: string | null) {
  const query = useHistory();
  const entries = accountLocalId ? (query.data?.[accountLocalId] ?? []) : [];
  return {
    ...query,
    data: accountLocalId ? entries.map(toSnapshot(accountLocalId)) : undefined,
  };
}

/** Records one balance edit. Re-reads the row first so two devices don't overwrite each other. */
export function useSaveBalanceSnapshot() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      account_local_id: string;
      account_name: string;
      old_balance: number;
      new_balance: number;
      note?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!currentTenantId) throw new Error("No workspace selected");
      const entry: BalanceEntry = {
        id: crypto.randomUUID(),
        from: payload.old_balance,
        to: payload.new_balance,
        ...(payload.note ? { note: payload.note } : {}),
        at: new Date().toISOString(),
        by: user.id,
      };
      const current = await readSetting(currentTenantId);
      await writeSetting(
        currentTenantId,
        mergeEntries(current, { [payload.account_local_id]: [entry] }),
        user.id,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(currentTenantId) });
    },
  });
}
