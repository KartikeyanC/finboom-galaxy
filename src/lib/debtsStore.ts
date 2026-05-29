import { useCallback, useEffect, useState } from "react";

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

function loadInitial(): DebtRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DebtRecord[]) : [];
  } catch {
    return [];
  }
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

export function useDebts() {
  const [records, setRecords] = useState<DebtRecord[]>(loadInitial);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* ignore */ }
  }, [records]);

  const upsert = useCallback((rec: DebtRecord) => {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === rec.id);
      if (idx === -1) return [rec, ...prev];
      const next = prev.slice();
      next[idx] = rec;
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const markPaid = useCallback((debtId: string, month: number, transactionId?: string) => {
    setRecords((prev) =>
      prev.map((d) =>
        d.id !== debtId
          ? d
          : {
              ...d,
              installments: d.installments.map((i) =>
                i.month === month
                  ? { ...i, status: "paid", paidAt: new Date().toISOString(), transactionId }
                  : i,
              ),
            },
      ),
    );
  }, []);

  return { records, upsert, remove, markPaid };
}
