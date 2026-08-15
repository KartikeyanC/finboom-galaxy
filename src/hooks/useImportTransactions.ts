import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { withImportHashes, type ImportHashInput } from "@/lib/importDedup";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";

export interface ImportTxnInput extends ImportHashInput {
  type: string;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
  occurred_at: string;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  attempted: number;
}

/**
 * Imports transactions idempotently.
 *
 * Every row is hashed and sent in ONE upsert with `ignoreDuplicates`, so rows
 * already present are skipped by the database rather than rejected row by row.
 * Re-running the same file is therefore safe and reports honestly how much was
 * actually new.
 *
 * This replaces the previous per-row `createTransaction` loop, which appended
 * unconditionally and silently doubled everything on a second upload.
 */
export function useImportTransactions() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();

  return useMutation<ImportResult, Error, ImportTxnInput[]>({
    mutationFn: async (rows) => {
      if (!user) throw new Error("Not signed in");
      if (!currentTenantId) throw new Error("No workspace selected");
      if (rows.length === 0) return { inserted: 0, skipped: 0, attempted: 0 };

      const { rows: hashed, duplicatesInFile } = await withImportHashes(rows);

      const payload = hashed.map((r) => ({
        user_id: user.id,
        tenant_id: currentTenantId,
        type: r.type,
        amount: r.amount,
        currency: r.currency,
        category: r.category,
        description: r.description ?? null,
        occurred_at: r.occurred_at,
        import_hash: r.import_hash,
      }));

      // ignoreDuplicates turns the unique-index collision into a skip.
      // `select()` returns only the rows actually written, which is what makes
      // the inserted/skipped split accurate.
      const { data, error } = await supabase
        .from("transactions")
        .upsert(payload, {
          onConflict: "tenant_id,import_hash",
          ignoreDuplicates: true,
        })
        .select("id");

      if (error) throw error;

      const inserted = data?.length ?? 0;
      return {
        inserted,
        skipped: rows.length - inserted,
        attempted: rows.length,
      };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      if (res.attempted === 0) return;
      if (res.skipped === 0) {
        toast.success(`Imported ${res.inserted} transaction${res.inserted === 1 ? "" : "s"}`);
      } else if (res.inserted === 0) {
        toast.info(`Already imported — all ${res.skipped} rows were duplicates`);
      } else {
        toast.success(`Imported ${res.inserted}, skipped ${res.skipped} duplicate${res.skipped === 1 ? "" : "s"}`);
      }
    },
    onError: (e) => notifyError(e),
  });
}
