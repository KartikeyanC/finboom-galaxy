import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";

export interface DebtInstallment {
  month: number;          // 1-based
  dueDate: string;        // YYYY-MM-DD
  amount: number;
  status: "pending" | "paid";
  paidAt?: string;
  reminderId?: string;
  transactionId?: string;
}

export interface DebtRecord {
  id: string;
  lender: string;
  category: string;
  currency: string;
  totalAmount: number;
  duration: number;
  monthly: number;
  firstDueDate: string;
  notes?: string;
  installments: DebtInstallment[];
  createdAt: string;
}

const STORAGE_KEY = "debts.records.v1";

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): DebtRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DebtRecord[]) : [];
  } catch {
    return [];
  }
}

type DebtRow = {
  id: string;
  lender: string;
  category: string | null;
  currency: string;
  total_amount: number;
  duration: number;
  monthly: number;
  first_due_date: string | null;
  notes: string | null;
  installments: DebtInstallment[] | null;
  created_at: string;
};

function rowToRecord(r: DebtRow): DebtRecord {
  return {
    id: r.id,
    lender: r.lender,
    category: r.category ?? "",
    currency: r.currency,
    totalAmount: Number(r.total_amount),
    duration: r.duration,
    monthly: Number(r.monthly),
    firstDueDate: r.first_due_date ?? "",
    notes: r.notes ?? undefined,
    installments: r.installments ?? [],
    createdAt: r.created_at,
  };
}

function recordToRow(rec: DebtRecord, tenantId: string) {
  return {
    id: rec.id,
    tenant_id: tenantId,
    lender: rec.lender,
    category: rec.category ?? null,
    currency: rec.currency,
    total_amount: rec.totalAmount ?? 0,
    duration: rec.duration ?? 0,
    monthly: rec.monthly ?? 0,
    first_due_date: rec.firstDueDate || null,
    notes: rec.notes ?? null,
    installments: (rec.installments ?? []) as unknown as Json,
    created_at: rec.createdAt ?? new Date().toISOString(),
  };
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function buildInstallments(
  total: number, duration: number, firstDue: string,
): DebtInstallment[] {
  if (!Number.isFinite(total) || total <= 0 || !duration || !firstDue) return [];
  const monthly = Number((total / duration).toFixed(2));
  const list: DebtInstallment[] = [];
  let accounted = 0;
  for (let i = 0; i < duration; i++) {
    const isLast = i === duration - 1;
    const amount = isLast ? Number((total - accounted).toFixed(2)) : monthly;
    accounted += amount;
    list.push({
      month: i + 1,
      dueDate: addMonths(firstDue, i),
      amount,
      status: "pending",
    });
  }
  return list;
}

export function computeMonthly(total: number, duration: number): number {
  if (!Number.isFinite(total) || total <= 0 || !duration || duration <= 0) return 0;
  return total / duration;
}

export function debtSummary(d: DebtRecord) {
  const paid = d.installments.filter((i) => i.status === "paid");
  const paidAmount = paid.reduce((s, i) => s + i.amount, 0);
  const remaining = d.totalAmount - paidAmount;
  const pct = d.totalAmount > 0 ? Math.round((paidAmount / d.totalAmount) * 100) : 0;
  return {
    paidCount: paid.length,
    remainingCount: d.duration - paid.length,
    paidAmount,
    remaining,
    pct,
  };
}

/** Debts are persisted server-side (tenant-scoped). API unchanged. */
export function useDebts() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["debts", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debts")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as DebtRow[]).map(rowToRecord);
    },
  });

  const records = data ?? [];
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["debts"] }),
    [qc],
  );

  const upsert = useCallback(
    async (rec: DebtRecord) => {
      if (!currentTenantId) return;
      const { error } = await supabase
        .from("debts")
        .upsert(recordToRow(rec, currentTenantId));
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("debts")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const markPaid = useCallback(
    async (debtId: string, month: number, transactionId?: string) => {
      const rec = records.find((d) => d.id === debtId);
      if (!rec) return;
      const installments = rec.installments.map((i) =>
        i.month === month
          ? { ...i, status: "paid" as const, paidAt: new Date().toISOString(), transactionId }
          : i,
      );
      const { error } = await supabase
        .from("debts")
        .update({ installments: installments as unknown as Json })
        .eq("id", debtId)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [records, currentTenantId, invalidate],
  );

  // One-time migration of legacy localStorage debts into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.debts.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void (async () => {
        const { error } = await supabase
          .from("debts")
          .upsert(local.map((r) => recordToRow(r, currentTenantId)));
        if (!error) {
          localStorage.setItem(flag, "1");
          invalidate();
        }
      })();
    } else {
      localStorage.setItem(flag, "1");
    }
  }, [currentTenantId, isLoading, data, invalidate]);

  return { records, upsert, remove, markPaid };
}
