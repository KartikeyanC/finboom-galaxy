import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";

export type DematTxnType = "fund_in" | "fund_out" | "buy" | "sell" | "dividend";

export interface DematAccount {
  id: string;
  broker: string;
  nickname: string | null;
  currency: string;
  openingBalance: number;
  openingDate: string | null;
  createdAt: string;
}

export interface DematLedgerEntry {
  id: string;
  dematAccountId: string;
  type: DematTxnType;
  amount: number;
  note: string | null;
  txnDate: string;
  refInvestmentId: string | null;
  createdAt: string;
}

// Raw row shapes as returned by PostgREST. Declared locally because these two
// tables are not yet in the generated types.ts (see the cast above).
interface DematAccountRow {
  id: string;
  broker: string;
  nickname: string | null;
  currency: string;
  opening_balance: number | string | null;
  opening_date: string | null;
  created_at: string;
}

interface DematLedgerRow {
  id: string;
  demat_account_id: string;
  type: string;
  amount: number | string;
  note: string | null;
  txn_date: string;
  ref_investment_id: string | null;
  created_at: string;
}

export interface DematAccountWithBalance extends DematAccount {
  balance: number;
  totalFunded: number;
  totalWithdrawn: number;
  ledger: DematLedgerEntry[];
}

// opening_balance is the pre-FinRoot starting cash.
// Credits: opening_balance + fund_in + sell + dividend. Debits: fund_out + buy.
function computeBalance(
  openingBalance: number,
  ledger: DematLedgerEntry[],
): { balance: number; totalFunded: number; totalWithdrawn: number } {
  let balance = openingBalance;
  let totalFunded = 0;
  let totalWithdrawn = 0;
  for (const e of ledger) {
    if (e.type === "fund_in" || e.type === "sell" || e.type === "dividend") {
      balance += e.amount;
      if (e.type === "fund_in") totalFunded += e.amount;
    } else {
      balance -= e.amount;
      if (e.type === "fund_out") totalWithdrawn += e.amount;
    }
  }
  return { balance, totalFunded, totalWithdrawn };
}

export function useDematAccounts() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["demat_accounts", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const [accRes, ledRes] = await Promise.all([
        supabase
          .from("demat_accounts")
          .select("*")
          .order("created_at", { ascending: true }),
        supabase
          .from("demat_ledger")
          .select("*")
          .order("txn_date", { ascending: true }),
      ]);
      if (accRes.error) throw accRes.error;
      if (ledRes.error) throw ledRes.error;

      const accounts: DematAccount[] = (accRes.data ?? []).map((r: DematAccountRow) => ({
        id: r.id,
        broker: r.broker,
        nickname: r.nickname,
        currency: r.currency,
        openingBalance: Number(r.opening_balance ?? 0),
        openingDate: r.opening_date ?? null,
        createdAt: r.created_at,
      }));

      const ledger: DematLedgerEntry[] = (ledRes.data ?? []).map((r: DematLedgerRow) => ({
        id: r.id,
        dematAccountId: r.demat_account_id,
        type: r.type as DematTxnType,
        amount: Number(r.amount),
        note: r.note,
        txnDate: r.txn_date,
        refInvestmentId: r.ref_investment_id,
        createdAt: r.created_at,
      }));

      return accounts.map((acc): DematAccountWithBalance => {
        const accLedger = ledger.filter((e) => e.dematAccountId === acc.id);
        const { balance, totalFunded, totalWithdrawn } = computeBalance(acc.openingBalance, accLedger);
        return { ...acc, balance, totalFunded, totalWithdrawn, ledger: accLedger };
      });
    },
  });

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["demat_accounts"] }),
    [qc],
  );

  const createAccount = useCallback(
    async (
      broker: string,
      nickname: string | null,
      currency: string,
      openingBalance: number = 0,
      openingDate: string | null = null,
    ) => {
      if (!currentTenantId) return null;
      const { data, error } = await supabase
        .from("demat_accounts")
        .insert({
          tenant_id: currentTenantId,
          broker,
          nickname,
          currency,
          opening_balance: openingBalance,
          opening_date: openingDate || null,
        })
        .select()
        .single();
      if (error) { notifyError(error); return null; }
      invalidate();
      return data.id as string;
    },
    [currentTenantId, invalidate],
  );

  const updateAccount = useCallback(
    async (
      id: string,
      fields: { openingBalance?: number; openingDate?: string | null; nickname?: string | null },
    ) => {
      const patch: TablesUpdate<"demat_accounts"> = {};
      if (fields.openingBalance !== undefined) patch.opening_balance = fields.openingBalance;
      if ("openingDate" in fields) patch.opening_date = fields.openingDate || null;
      if ("nickname" in fields) patch.nickname = fields.nickname || null;
      const { error } = await supabase.from("demat_accounts").update(patch).eq("id", id);
      if (error) { notifyError(error); return; }
      invalidate();
    },
    [invalidate],
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("demat_accounts").delete().eq("id", id);
      if (error) { notifyError(error); return; }
      invalidate();
    },
    [invalidate],
  );

  const addLedgerEntry = useCallback(
    async (
      dematAccountId: string,
      type: DematTxnType,
      amount: number,
      txnDate: string,
      note?: string,
    ) => {
      if (!currentTenantId) return;
      const { error } = await supabase.from("demat_ledger").insert({
        tenant_id: currentTenantId,
        demat_account_id: dematAccountId,
        type,
        amount,
        txn_date: txnDate,
        note: note ?? null,
      });
      if (error) { notifyError(error); return; }
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const updateLedgerEntry = useCallback(
    async (
      id: string,
      type: DematTxnType,
      amount: number,
      txnDate: string,
      note?: string,
    ) => {
      const { error } = await supabase.from("demat_ledger").update({
        type,
        amount,
        txn_date: txnDate,
        note: note ?? null,
      }).eq("id", id);
      if (error) { notifyError(error); return; }
      invalidate();
    },
    [invalidate],
  );

  const deleteLedgerEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("demat_ledger").delete().eq("id", id);
      if (error) { notifyError(error); return; }
      invalidate();
    },
    [invalidate],
  );

  return {
    accounts: data ?? [],
    isLoading,
    createAccount,
    updateAccount,
    deleteAccount,
    addLedgerEntry,
    updateLedgerEntry,
    deleteLedgerEntry,
  };
}
