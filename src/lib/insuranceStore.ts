import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";
import { INSURANCE_BUCKET, documentPath, contentTypeFor } from "@/lib/insuranceDocs";

export type InsuranceCategory = "health" | "life" | "vehicle" | "gadget" | "other";

export type PayStructure = "1-Pay" | "Limited-Pay" | "Regular-Pay";
export type PaymentFrequency = "Monthly" | "Quarterly" | "Half-Yearly" | "Annual" | "One-Time";

export const PAY_STRUCTURES: PayStructure[] = ["1-Pay", "Limited-Pay", "Regular-Pay"];
export const PAYMENT_FREQUENCIES: PaymentFrequency[] = ["Monthly", "Quarterly", "Half-Yearly", "Annual", "One-Time"];

export const FREQUENCY_MULTIPLIER: Record<PaymentFrequency, number> = {
  Monthly: 12,
  Quarterly: 4,
  "Half-Yearly": 2,
  Annual: 1,
  "One-Time": 0,
};

export interface InsurancePolicy {
  id: string;
  category: InsuranceCategory;
  policyName: string;
  provider: string;
  policyNumber: string;
  sumInsured: number;
  premium: number;
  payStructure: PayStructure;
  paymentFrequency: PaymentFrequency;
  /** ISO YYYY-MM-DD */
  dueDate: string;
  documentName?: string;
  /** Stage 3.3: object path in the `insurance-docs` bucket. Preferred. */
  documentPath?: string;
  /**
   * A pre-3.3 inline document exists for this policy. Derived server-side so
   * the list can render the View button without downloading the blob to find
   * out — which is the whole point of 3.3.
   */
  hasLegacyDocument?: boolean;
  /**
   * DEPRECATED (Stage 3.3). Inline base64 for policies created before the move
   * to Storage. Never written any more, and NOT fetched by the list query —
   * `loadLegacyDocument()` pulls it on demand for the one row being opened.
   */
  documentDataUrl?: string;
  documentMime?: string;
  notes?: string;
  createdAt: string;
}

const STORAGE_KEY = "insurance.policies.v1";

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): InsurancePolicy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: InsurancePolicy[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type InsuranceRow = {
  id: string;
  category: string;
  policy_name: string;
  provider: string | null;
  policy_number: string | null;
  sum_insured: number;
  premium: number;
  pay_structure: string | null;
  payment_frequency: string | null;
  due_date: string | null;
  document_name: string | null;
  document_path: string | null;
  /** Generated column: is there a pre-3.3 inline document, without fetching it. */
  has_legacy_document: boolean | null;
  /** Not selected by the list query — see loadLegacyDocument(). */
  document_data_url?: string | null;
  document_mime: string | null;
  notes: string | null;
  created_at: string;
};

function rowToPolicy(r: InsuranceRow): InsurancePolicy {
  return {
    id: r.id,
    category: r.category as InsuranceCategory,
    policyName: r.policy_name,
    provider: r.provider ?? "",
    policyNumber: r.policy_number ?? "",
    sumInsured: Number(r.sum_insured),
    premium: Number(r.premium),
    payStructure: (r.pay_structure as PayStructure) ?? "Regular-Pay",
    paymentFrequency: (r.payment_frequency as PaymentFrequency) ?? "Annual",
    dueDate: r.due_date ?? "",
    documentName: r.document_name ?? undefined,
    documentPath: r.document_path ?? undefined,
    hasLegacyDocument: !!r.has_legacy_document,
    documentDataUrl: r.document_data_url ?? undefined,
    documentMime: r.document_mime ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

/** Map camelCase policy fields (full or partial) to snake_case columns. */
function policyToRow(p: Partial<InsurancePolicy>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.category !== undefined) row.category = p.category;
  if (p.policyName !== undefined) row.policy_name = p.policyName;
  if (p.provider !== undefined) row.provider = p.provider;
  if (p.policyNumber !== undefined) row.policy_number = p.policyNumber;
  if (p.sumInsured !== undefined) row.sum_insured = p.sumInsured;
  if (p.premium !== undefined) row.premium = p.premium;
  if (p.payStructure !== undefined) row.pay_structure = p.payStructure;
  if (p.paymentFrequency !== undefined) row.payment_frequency = p.paymentFrequency;
  if (p.dueDate !== undefined) row.due_date = p.dueDate || null;
  if (p.documentName !== undefined) row.document_name = p.documentName ?? null;
  if (p.documentPath !== undefined) row.document_path = p.documentPath ?? null;
  // documentDataUrl is intentionally NOT writable: Stage 3.3 made Storage the
  // only destination for new uploads. Clearing a legacy one is allowed, so a
  // detach can free the row.
  if (p.documentDataUrl === null) row.document_data_url = null;
  if (p.documentMime !== undefined) row.document_mime = p.documentMime ?? null;
  if (p.notes !== undefined) row.notes = p.notes ?? null;
  return row;
}

/** Insurance policies are persisted server-side (tenant-scoped). API unchanged. */
export function useInsurance() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["insurance", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      // Explicit columns, NOT `*` — Stage 3.3. `document_data_url` can hold a
      // multi-megabyte base64 blob per row, and `*` dragged every one of them
      // into the browser on each mount. Legacy documents are fetched one at a
      // time by loadLegacyDocument() only if someone actually opens one.
      const { data, error } = await supabase
        .from("insurance")
        // One string literal, not a concatenation: supabase-js infers the row
        // type by parsing this at the TYPE level, and a `+` expression is not a
        // literal type, so the result degrades to GenericStringError[].
        .select("id, category, policy_name, provider, policy_number, sum_insured, premium, pay_structure, payment_frequency, due_date, document_name, document_path, document_mime, has_legacy_document, notes, created_at")
        .eq("tenant_id", currentTenantId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as InsuranceRow[]).map(rowToPolicy);
    },
  });

  const items = data ?? [];
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["insurance"] }),
    [qc],
  );

  const add = useCallback(
    async (p: Omit<InsurancePolicy, "id" | "createdAt">) => {
      if (!currentTenantId) return;
      const { error } = await supabase
        .from("insurance")
        .insert({ ...policyToRow(p), tenant_id: currentTenantId } as unknown as TablesInsert<"insurance">);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const update = useCallback(
    async (id: string, patch: Partial<InsurancePolicy>) => {
      const { error } = await supabase
        .from("insurance")
        .update(policyToRow(patch) as unknown as TablesUpdate<"insurance">)
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("insurance")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  // One-time migration of legacy localStorage policies into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.insurance.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void (async () => {
        const rows = local.map((p) => ({ ...policyToRow(p), tenant_id: currentTenantId }));
        const { error } = await supabase
          .from("insurance")
          .insert(rows as unknown as TablesInsert<"insurance">[]);
        if (!error) {
          localStorage.setItem(flag, "1");
          invalidate();
        }
      })();
    } else {
      localStorage.setItem(flag, "1");
    }
  }, [currentTenantId, isLoading, data, invalidate]);

  return { items, add, update, remove };
}

/* ── Stage 3.3 · policy documents in Storage ──────────────────────────────── */

/**
 * Upload a document for a policy and return the fields to store on the row.
 *
 * The bucket independently enforces the size cap and MIME allow-list, so a
 * client that skipped `validateDocument` still cannot get a 50 MB file in.
 */
export async function uploadPolicyDocument(
  tenantId: string,
  policyId: string,
  file: File,
): Promise<{ documentPath: string; documentName: string; documentMime: string }> {
  const path = documentPath(tenantId, policyId, file.name);
  const { error } = await supabase.storage
    .from(INSURANCE_BUCKET)
    .upload(path, file, { contentType: contentTypeFor(file), upsert: false });
  if (error) throw error;
  return { documentPath: path, documentName: file.name, documentMime: contentTypeFor(file) };
}

/**
 * A short-lived URL for a private object. Signed rather than public because the
 * bucket holds policy numbers and personal documents; five minutes is enough to
 * open the viewer and short enough that a copied link goes stale quickly.
 */
export async function signedDocumentUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(INSURANCE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Remove the object backing a policy. Best-effort on purpose: the row is the
 * record, and a failed delete should not block detaching the document. It
 * leaves an orphaned object rather than a row pointing at nothing.
 */
export async function deletePolicyDocument(path: string): Promise<void> {
  await supabase.storage.from(INSURANCE_BUCKET).remove([path]);
}

/**
 * Fetch a pre-3.3 inline document for ONE policy, on demand.
 *
 * Deliberately not part of the list query — that is the whole point of 3.3.
 */
export async function loadLegacyDocument(
  tenantId: string,
  policyId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("insurance")
    .select("document_data_url")
    .eq("tenant_id", tenantId)
    .eq("id", policyId)
    .maybeSingle();
  if (error || !data) return null;
  return data.document_data_url ?? null;
}

/**
 * Whole days from today to `iso`, or **null when there is no usable date**.
 *
 * 🔴 BUG-087. `insurance.due_date` is nullable and `fromRow` maps a null to
 * `""`, so this used to return `NaN` — which is not less than zero, not greater
 * than zero, and formats as "NaN". A policy imported without a renewal date
 * rendered a card reading "Invalid Date" with a "NaN DAYS" countdown, and the
 * overdue/urgent counts silently skipped it in both directions.
 *
 * Returning `null` rather than a sentinel number forces every caller to say
 * what "no date" means for it — which is a different answer in each place: not
 * overdue, not urgent, no countdown ring, and a dash where the date goes.
 */
export function daysUntil(iso: string | null | undefined): number | null {
  const d = parseDueDate(iso);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/**
 * A renewal date is a **calendar date, not an instant** — local midnight of the
 * day written in the column.
 *
 * `new Date("2026-03-09")` is parsed by the language as UTC midnight, so west
 * of UTC it lands on the *8th* in local time and every countdown is a day
 * short. India (UTC+5:30) hides this completely, which is exactly why it is
 * worth pinning now rather than discovering it from a second market. Anything
 * carrying a time (imports do) is reduced to the calendar day it names.
 */
function parseDueDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const text = iso.trim();
  if (!text) return null;

  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (ymd) {
    const [, y, m, day] = ymd.map(Number) as unknown as [string, number, number, number];
    const d = new Date(y, m - 1, day);
    // `new Date(2026, 12, 45)` happily rolls over into the next year, so an
    // out-of-range string would become a real date instead of being rejected.
    const round = d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day;
    return round ? d : null;
  }

  const d = new Date(text);
  if (!Number.isFinite(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Inside this many days a renewal is "urgent" rather than merely upcoming. */
export const URGENT_DAYS = 15;

/**
 * `unknown` is a fourth state, not a flavour of `ok`.
 *
 * The thresholds were written out three times in `Insurance.tsx` — the overdue
 * count, the urgent count, and the card — which is how BUG-087 managed to be
 * wrong in three different ways at once (ADR-0008). One implementation, and
 * "we do not know when this renews" is a thing the card is allowed to say.
 */
export type PolicyUrgency = "overdue" | "urgent" | "ok" | "unknown";

export function policyUrgency(
  dueDate: string | null | undefined,
  urgentWithinDays = URGENT_DAYS,
): PolicyUrgency {
  const d = daysUntil(dueDate);
  if (d === null) return "unknown";
  if (d < 0) return "overdue";
  return d < urgentWithinDays ? "urgent" : "ok";
}

/** What the card shows where a renewal date would go. */
export const NO_DUE_DATE = "Not set";

/**
 * A policy's renewal date for display. An unusable date reads as `NO_DUE_DATE`
 * rather than "Invalid Date", which looks like the app is broken rather than
 * like the field is empty.
 */
export function formatDueDate(iso: string | null | undefined, locale = "en-IN"): string {
  const d = parseDueDate(iso);
  if (!d) return NO_DUE_DATE;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export const CATEGORY_META: Record<InsuranceCategory, { label: string; emoji: string; tone: string }> = {
  health: { label: "Health", emoji: "🏥", tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  life: { label: "Life", emoji: "🛡️", tone: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
  vehicle: { label: "Vehicle", emoji: "🚗", tone: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  gadget: { label: "Gadget", emoji: "📱", tone: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  other: { label: "Other", emoji: "📦", tone: "bg-muted text-muted-foreground border-border" },
};