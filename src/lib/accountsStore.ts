import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";

export type AccountType =
  | "bank"
  | "debit"
  | "credit"
  | "wallet"
  | "cash"
  | "investment"
  | "other";

/** Persisted shape — JSON-friendly. AccountsManager converts to/from its FormState. */
export type StoredAccount = {
  id: string;
  type: AccountType;
  name: string;
  holder?: string;
  bank?: string;
  bankCustom?: string;
  last4?: string;
  expMonth?: string;
  expYear?: string;
  branch?: string;
  openingBalance?: string;
  openingDateISO?: string;
  color?: string;
  icon?: string;
  purposes?: string[];
};

const KEY = "finroot.accounts.v1";

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- DB row <-> StoredAccount mapping --------------------------------------

type AccountRow = {
  id: string;
  type: string;
  name: string;
  holder: string | null;
  bank: string | null;
  bank_custom: string | null;
  last4: string | null;
  exp_month: string | null;
  exp_year: string | null;
  branch: string | null;
  opening_balance: number | null;
  opening_date: string | null;
  color: string | null;
  icon: string | null;
  purposes: string[] | null;
};

function rowToStored(r: AccountRow): StoredAccount {
  return {
    id: r.id,
    type: r.type as AccountType,
    name: r.name,
    holder: r.holder ?? undefined,
    bank: r.bank ?? undefined,
    bankCustom: r.bank_custom ?? undefined,
    last4: r.last4 ?? undefined,
    expMonth: r.exp_month ?? undefined,
    expYear: r.exp_year ?? undefined,
    branch: r.branch ?? undefined,
    openingBalance: r.opening_balance != null ? String(r.opening_balance) : undefined,
    openingDateISO: r.opening_date ? new Date(r.opening_date).toISOString() : undefined,
    color: r.color ?? undefined,
    icon: r.icon ?? undefined,
    purposes: r.purposes ?? undefined,
  };
}

function storedToRow(a: StoredAccount, tenantId: string) {
  return {
    id: a.id,
    tenant_id: tenantId,
    type: a.type,
    name: a.name,
    holder: a.holder ?? null,
    bank: a.bank ?? null,
    bank_custom: a.bankCustom ?? null,
    last4: a.last4 ?? null,
    exp_month: a.expMonth ?? null,
    exp_year: a.expYear ?? null,
    branch: a.branch ?? null,
    opening_balance:
      a.openingBalance != null && a.openingBalance !== ""
        ? Number(a.openingBalance)
        : null,
    opening_date: a.openingDateISO ? a.openingDateISO.slice(0, 10) : null,
    color: a.color ?? null,
    icon: a.icon ?? null,
    purposes: a.purposes ?? null,
  };
}

/**
 * Accounts are now persisted server-side (tenant-scoped). The public API
 * ({ accounts, upsert, remove, setAll }) is unchanged so existing consumers
 * keep working. setAll diff-syncs the whole list (account counts are tiny).
 */
export function useAccounts() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["accounts", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      // RLS admits every workspace the user belongs to; scope to the active one.
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as AccountRow[]).map(rowToStored);
    },
  });

  const accounts = data ?? [];
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["accounts"] }),
    [qc],
  );

  const upsert = useCallback(
    async (acc: StoredAccount) => {
      if (!currentTenantId) return;
      const { error } = await supabase
        .from("accounts")
        .upsert(storedToRow(acc, currentTenantId));
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!currentTenantId) return;
      const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const setAll = useCallback(
    async (list: StoredAccount[]) => {
      if (!currentTenantId) return;
      const current = qc.getQueryData<StoredAccount[]>(queryKey) ?? accounts;
      const nextIds = new Set(list.map((a) => a.id));
      const toDelete = current.filter((a) => !nextIds.has(a.id)).map((a) => a.id);

      if (list.length) {
        const { error } = await supabase
          .from("accounts")
          .upsert(list.map((a) => storedToRow(a, currentTenantId)));
        if (error) return notifyError(error);
      }
      if (toDelete.length) {
        const { error } = await supabase
          .from("accounts")
          .delete()
          .in("id", toDelete)
          .eq("tenant_id", currentTenantId);
        if (error) return notifyError(error);
      }
      invalidate();
    },
    [currentTenantId, accounts, qc, queryKey, invalidate],
  );

  // One-time migration of any legacy localStorage accounts into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.accounts.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void setAll(local).then(() => localStorage.setItem(flag, "1"));
    } else {
      localStorage.setItem(flag, "1");
    }
  }, [currentTenantId, isLoading, data, setAll]);

  return { accounts, upsert, remove, setAll };
}

/** Virtual "cash on hand" account. Always present in trip allocation matrix. */
export const CASH_ACCOUNT_ID = "_cash";

/** Map any account type to one of the 4 trip-bucket categories. */
export type TripBucket = "bank" | "credit" | "wallet" | "cash";

export function bucketOf(type: AccountType): TripBucket {
  if (type === "credit") return "credit";
  if (type === "wallet") return "wallet";
  if (type === "cash") return "cash";
  // bank, debit, investment, other → bank bucket
  return "bank";
}

export const BUCKET_META: Record<
  TripBucket,
  { label: string; emoji: string; gradient: { from: string; to: string } }
> = {
  bank: {
    label: "Bank / Debit",
    emoji: "🏦",
    gradient: { from: "#0f3a2d", to: "#1f8a5f" },
  },
  credit: {
    label: "Credit Card",
    emoji: "💳",
    gradient: { from: "#0b1530", to: "#1e3a8a" },
  },
  wallet: {
    label: "Wallet / UPI",
    emoji: "📱",
    gradient: { from: "#2a1648", to: "#7c3aed" },
  },
  cash: {
    label: "Cash",
    emoji: "💵",
    gradient: { from: "#3a2410", to: "#b87333" },
  },
};
