import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildSummary, type OnboardingSelections } from "@/lib/onboardingWizard";

export function Summary({
  selections,
  busy,
  onFinish,
}: {
  selections: OnboardingSelections;
  busy: boolean;
  onFinish: () => void;
}) {
  const lines = buildSummary(selections);

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="font-display text-xl font-semibold">Your Finroot is ready.</h2>
        <p className="text-sm text-muted-foreground">
          Here's what you told us — you can change any of this later in Settings.
        </p>
      </div>

      {lines.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-4 text-left text-sm text-foreground">
          {lines.map((line) => (
            <li key={line} className="leading-snug">
              {line}
            </li>
          ))}
        </ul>
      )}

      <Button className="w-full" size="lg" onClick={onFinish} disabled={busy}>
        {busy ? "Setting things up…" : "Go to My Dashboard"}
      </Button>
    </div>
  );
}
