import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { INSURANCE_BUCKET } from "@/lib/insuranceDocs";
import {
  buildExportBundle,
  bundleFilename,
  totalRows,
  type ExportBundle,
  type ExportScope,
  type StoredDocument,
} from "@/lib/dataExport";

/**
 * Stage 5.2 — wires the export builder to Supabase and hands the browser a file.
 *
 * Every read goes through the ordinary anon client, so RLS applies exactly as
 * it does everywhere else in the app. That is the security argument for the
 * whole feature: there is no privileged path to abuse, and the export is
 * incapable of returning data the user could not already open in a page.
 */

/**
 * The table name is a runtime string here, so the generated per-table typing
 * cannot apply. This is the single place that widening happens; the row shape
 * is deliberately `unknown` because the bundle is written out verbatim.
 *
 * ⚠️ `.bind(supabase)` is load-bearing. Detaching the method loses `this`, and
 * every call then dies inside PostgrestClient with "Cannot read properties of
 * undefined (reading 'rest')" — which the builder dutifully records as 25
 * unavailable tables, i.e. a downloadable, empty, entirely plausible-looking
 * export. Only the end-to-end test caught it.
 */
const from = supabase.from.bind(supabase) as unknown as (table: string) => {
  select: (cols: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & {
    eq: (col: string, val: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
  };
};

export type ExportState =
  | { status: "idle" }
  | { status: "working"; table: string }
  | { status: "done"; rows: number; tables: number; missing: number; filename: string }
  | { status: "error"; message: string };

export function useDataExport(tenantId: string | null, workspaceName: string | null, application: string) {
  const [state, setState] = useState<ExportState>({ status: "idle" });

  const run = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        setState({ status: "error", message: "You are signed out. Sign in and try again." });
        return;
      }

      const readTable = async (table: string, scope: ExportScope): Promise<unknown[]> => {
        setState({ status: "working", table });
        const query = from(table).select("*");
        // Scope is belt-and-braces: RLS already restricts every one of these
        // tables. The filter keeps a multi-workspace user's export to the
        // workspace they asked for, which is what the manifest claims.
        const result =
          scope === "self" ? await query.eq("id", user.id)
          : scope === "user" ? await query.eq("user_id", user.id)
          : scope === "workspace" ? (tenantId ? await query.eq("id", tenantId) : await query)
          : tenantId ? await query.eq("tenant_id", tenantId)
          : await query;
        if (result.error) throw new Error(result.error.message);
        return result.data ?? [];
      };

      const listDocuments = async (): Promise<StoredDocument[]> => {
        if (!tenantId) return [];
        setState({ status: "working", table: "documents" });
        const { data, error } = await supabase.storage.from(INSURANCE_BUCKET).list(tenantId, { limit: 1000 });
        if (error) throw new Error(error.message);
        return (data ?? []).map((f) => ({
          bucket: INSURANCE_BUCKET,
          path: `${tenantId}/${f.name}`,
          size: (f.metadata as { size?: number } | null)?.size ?? null,
          updated_at: f.updated_at ?? null,
        }));
      };

      const bundle: ExportBundle = await buildExportBundle({
        user: { id: user.id, email: user.email ?? null },
        workspace: { id: tenantId, name: workspaceName },
        application,
        readTable,
        listDocuments,
      });

      const filename = bundleFilename(new Date(), application);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      // Release the blob once the browser has taken it; leaking one per export
      // holds the whole file in memory for the life of the tab.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setState({
        status: "done",
        rows: totalRows(bundle),
        tables: Object.keys(bundle.manifest.included).length,
        missing: bundle.manifest.unavailable.length,
        filename,
      });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [tenantId, workspaceName, application]);

  return { state, run };
}
