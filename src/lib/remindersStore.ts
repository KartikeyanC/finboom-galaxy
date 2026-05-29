import { useCallback, useEffect, useState } from "react";

export type ReminderContext = "fixed_due" | "balance_buffer" | "maturity";
export type ReminderFrequency = "one_time" | "monthly" | "quarterly";
export type GraceWindow = "exact" | "1d" | "3d";
export type MaturityLead = "30d" | "7d";

export interface DebtLink {
  debtId: string;
  month: number;
  totalMonths: number;
  lender: string;
}

export interface ReminderRecord {
  id: string;
  title: string;
  context: ReminderContext;
  /** ISO date YYYY-MM-DD */
  date: string;
  amount?: number;
  currency?: string;
  notes?: string;
  source?: "accounts" | "bills" | "investments" | "manual" | "debt";
  sourceId?: string;
  // Type A
  frequency?: ReminderFrequency;
  grace?: GraceWindow;
  // Type B
  verifyLiquidity?: boolean;
  // Type C
  maturityLeads?: MaturityLead[];
  // Debt installment linkage
  debt?: DebtLink;
  status?: "scheduled" | "completed";
  createdAt: string;
}

const STORAGE_KEY = "reminders.records.v1";

function offset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seed(): ReminderRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      title: "HDFC Credit Card Bill",
      context: "fixed_due",
      date: offset(1),
      amount: 24500,
      currency: "INR",
      frequency: "monthly",
      grace: "3d",
      source: "bills",
      status: "scheduled",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: "Nifty 50 Index SIP",
      context: "balance_buffer",
      date: offset(5),
      amount: 10000,
      currency: "INR",
      verifyLiquidity: true,
      source: "investments",
      status: "scheduled",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: "SBI Fixed Deposit Maturity",
      context: "maturity",
      date: offset(34),
      amount: 500000,
      currency: "INR",
      maturityLeads: ["30d", "7d"],
      source: "investments",
      status: "scheduled",
      createdAt: now,
    },
  ];
}

function loadInitial(): ReminderRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReminderRecord[]) : seed();
  } catch {
    return seed();
  }
}

function rollForward(rec: ReminderRecord): ReminderRecord {
  if (rec.status === "completed") return rec;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(rec.date);
  due.setHours(0, 0, 0, 0);
  if (due.getTime() >= today.getTime()) return rec;

  if (rec.context === "fixed_due" && rec.frequency && rec.frequency !== "one_time") {
    const next = new Date(due);
    const step = rec.frequency === "monthly" ? 1 : 3;
    while (next.getTime() < today.getTime()) {
      next.setMonth(next.getMonth() + step);
    }
    return { ...rec, date: next.toISOString().slice(0, 10) };
  }
  return { ...rec, status: "completed" };
}

export function defaultMessage(rec: ReminderRecord): string {
  if (rec.notes && rec.notes.trim().length > 0) return rec.notes.trim();
  const name = rec.title || "scheduled item";
  switch (rec.context) {
    case "fixed_due":
      return `Reminder: Your ${name} payment is due tomorrow.`;
    case "balance_buffer":
      return `Heads up: ${name} will debit shortly — verify your funding account balance.`;
    case "maturity":
      return `${name} is approaching maturity — plan your reallocation.`;
  }
}

export function priorityBucket(iso: string): {
  label: string;
  tone: "danger" | "warn" | "safe";
  days: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days <= 2) return { label: "Action Required", tone: "danger", days };
  if (days <= 7) return { label: "Upcoming", tone: "warn", days };
  return { label: "Scheduled", tone: "safe", days };
}

export const CONTEXT_LABEL: Record<ReminderContext, string> = {
  fixed_due: "Fixed Due Date",
  balance_buffer: "Balance Buffer Alert",
  maturity: "Maturity Horizon",
};

export const CONTEXT_HINT: Record<ReminderContext, string> = {
  fixed_due: "Credit cards, utilities, rent & EMI",
  balance_buffer: "SIPs, mutual funds & RDs",
  maturity: "Fixed deposits & bonds",
};

export function useReminders() {
  const [records, setRecords] = useState<ReminderRecord[]>(() =>
    loadInitial().map(rollForward),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      /* ignore */
    }
  }, [records]);

  const upsert = useCallback((rec: ReminderRecord) => {
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

  const complete = useCallback((id: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "completed" } : r)),
    );
  }, []);

  return { records, upsert, remove, complete };
}
