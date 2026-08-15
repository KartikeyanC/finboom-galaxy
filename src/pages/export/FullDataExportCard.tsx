import { AlertTriangle, CheckCircle2, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranding } from "@/hooks/useBranding";
import { useTenant } from "@/contexts/TenantContext";
import { useDataExport } from "@/hooks/useDataExport";
import { EXPORT_TABLES } from "@/lib/dataExport";

/**
 * Stage 5.2 — the data-portability export, as opposed to the report.
 *
 * The rest of this page produces a statement: a date range, the sections you
 * ticked, formatted for reading. This produces the RECORD: every row of every
 * table that can hold your data in this workspace, unfiltered, as JSON. They
 * look similar and are not the same thing, so the card says which is which.
 */
export default function FullDataExportCard() {
  const { appName } = useBranding();
  const { currentTenantId, current } = useTenant();
  const { state, run } = useDataExport(currentTenantId, current?.name ?? null, appName);

  const working = state.status === "working";

  return (
    <Card className="border-border/60 shadow-sm print:hidden">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Database className="w-3.5 h-3.5 text-primary" />
          </div>
          Your data
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Download everything {appName} holds about you in this workspace — all{" "}
          {EXPORT_TABLES.length} tables, every column, as one JSON file. This is the
          complete record, not the report above.
        </p>

        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2 h-9"
          onClick={run}
          disabled={working}
        >
          {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {working ? "Collecting…" : "Download all my data"}
        </Button>

        {/* Naming the table being read is not decoration: on a large workspace
            this takes a few seconds, and a silent button reads as a dead one. */}
        {working && (
          <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            Reading {state.table}…
          </p>
        )}

        {state.status === "done" && (
          <div className="space-y-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3" aria-live="polite">
            <p className="text-xs font-medium text-emerald-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {state.filename}
            </p>
            <p className="text-xs text-muted-foreground">
              {state.rows.toLocaleString("en-IN")} rows across {state.tables} tables.
            </p>
            {/* A partial export must say so in the interface, not only inside
                the file the user may never open. */}
            {state.missing > 0 && (
              <p className="text-xs text-amber-500">
                {state.missing} table{state.missing === 1 ? "" : "s"} could not be read — see
                “unavailable” in the file.
              </p>
            )}
          </div>
        )}

        {state.status === "error" && (
          <p className="text-xs text-destructive flex items-start gap-1.5" aria-live="polite">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {state.message}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Uploaded documents are listed in the file and downloaded from the Insurance page. To have
          your account deleted, see the{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}
