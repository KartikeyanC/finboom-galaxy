import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnboarding } from "@/hooks/useOnboarding";
import { SAMPLE_LABEL } from "@/lib/onboarding";

/**
 * Stage 5.3 — removing the sample workspace, reachable after the checklist is
 * gone.
 *
 * The checklist can be dismissed, and it retires itself once the workspace is
 * set up. Either would strand a user with a dozen invented transactions in
 * their ledger and no button to remove them, so the offer to remove lives
 * somewhere permanent as well. It renders only when sample data actually
 * exists — a settings page full of controls for things you do not have is its
 * own kind of clutter.
 */
export default function SampleDataCard() {
  const { sample, canManage, removeSample, sampleBusy } = useOnboarding();

  if (!sample || !canManage) return null;

  const rows = sample.transactions.length + sample.budgets.length + sample.goals.length;
  const loadedOn = new Date(sample.at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          Sample data
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {rows} made-up rows were added on {loadedOn} so the app had something to show. They are
          real rows in this workspace — they appear in your ledger, your charts and your export —
          and each one is labelled “{SAMPLE_LABEL}”.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2 h-9"
          onClick={removeSample}
          disabled={sampleBusy}
        >
          {sampleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Remove sample data
        </Button>
        {/* Says what it will and will not touch, because "remove sample data"
            on a page next to "delete my account" needs to be unambiguous. */}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Only those {rows} rows are deleted, by id. Anything you have added yourself is untouched,
          including edits — if you changed a sample row, your changes go with it.
        </p>
      </CardContent>
    </Card>
  );
}
