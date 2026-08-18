import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";

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

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): ReminderRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

/** BUG-105 — "is due tomorrow" was hardcoded regardless of the actual date. */
function dueDatePhrase(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `was due ${-days === 1 ? "yesterday" : `${-days} days ago`}`;
  if (days === 0) return "is due today";
  if (days === 1) return "is due tomorrow";
  return `is due in ${days} days`;
}

export function defaultMessage(rec: ReminderRecord): string {
  if (rec.notes && rec.notes.trim().length > 0) return rec.notes.trim();
  const name = rec.title || "scheduled item";
  switch (rec.context) {
    case "fixed_due":
      return `Reminder: Your ${name} payment ${dueDatePhrase(rec.date)}.`;
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

type ReminderRow = {
  id: string;
  title: string;
  context: string;
  due_date: string;
  amount: number | null;
  currency: string | null;
  notes: string | null;
  source: string | null;
  source_id: string | null;
  frequency: string | null;
  grace: string | null;
  verify_liquidity: boolean | null;
  maturity_leads: MaturityLead[] | null;
  debt: DebtLink | null;
  status: string | null;
  created_at: string;
};

function rowToRecord(r: ReminderRow): ReminderRecord {
  return {
    id: r.id,
    title: r.title,
    context: r.context as ReminderContext,
    date: r.due_date,
    amount: r.amount ?? undefined,
    currency: r.currency ?? undefined,
    notes: r.notes ?? undefined,
    source: (r.source as ReminderRecord["source"]) ?? undefined,
    sourceId: r.source_id ?? undefined,
    frequency: (r.frequency as ReminderFrequency) ?? undefined,
    grace: (r.grace as GraceWindow) ?? undefined,
    verifyLiquidity: r.verify_liquidity ?? undefined,
    maturityLeads: r.maturity_leads ?? undefined,
    debt: r.debt ?? undefined,
    status: (r.status as ReminderRecord["status"]) ?? undefined,
    createdAt: r.created_at,
  };
}

function recordToRow(rec: ReminderRecord, tenantId: string) {
  return {
    id: rec.id,
    tenant_id: tenantId,
    title: rec.title,
    context: rec.context,
    due_date: rec.date,
    amount: rec.amount ?? null,
    currency: rec.currency ?? null,
    notes: rec.notes ?? null,
    source: rec.source ?? null,
    source_id: rec.sourceId ?? null,
    frequency: rec.frequency ?? null,
    grace: rec.grace ?? null,
    verify_liquidity: rec.verifyLiquidity ?? null,
    maturity_leads: (rec.maturityLeads ?? null) as unknown as Json,
    debt: (rec.debt ?? null) as unknown as Json,
    status: rec.status ?? "scheduled",
    created_at: rec.createdAt ?? new Date().toISOString(),
  };
}

export function useReminders() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["reminders", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminders")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as ReminderRow[]).map(rowToRecord);
    },
  });

  // rollForward is applied as a display transform (no write-on-read).
  const records = useMemo(() => (data ?? []).map(rollForward), [data]);
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["reminders"] }),
    [qc],
  );

  const upsert = useCallback(
    async (rec: ReminderRecord) => {
      if (!currentTenantId) return;
      const { error } = await supabase
        .from("reminders")
        .upsert(recordToRow(rec, currentTenantId));
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("reminders")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const complete = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("reminders")
        .update({ status: "completed" })
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  // One-time migration of legacy localStorage reminders into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.reminders.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void (async () => {
        const { error } = await supabase
          .from("reminders")
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

  return { records, upsert, remove, complete };
}
