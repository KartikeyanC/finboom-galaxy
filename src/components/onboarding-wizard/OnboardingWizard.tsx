import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboardingWizard } from "@/hooks/useOnboardingWizard";
import { canProceed, TOTAL_STEPS, type OnboardingSelections } from "@/lib/onboardingWizard";
import { WizardProgress } from "./WizardProgress";
import { Summary } from "./Summary";
import { StepProfile } from "./steps/StepProfile";
import { StepIncome } from "./steps/StepIncome";
import { StepFinancialPosition } from "./steps/StepFinancialPosition";
import { StepGoals } from "./steps/StepGoals";
import { StepHabits } from "./steps/StepHabits";

/**
 * Stage 6.1 — the new-user onboarding gate. Rendered by `ProtectedRoute` IN
 * PLACE of the dashboard (same pattern as the existing `PinSetup`/
 * `LockScreen` gates), so any `/app/...` deep link re-enters it and "resume
 * on reload" falls out for free — no route of its own.
 *
 * Step 1 is not skippable (Step 2's income ranges need the chosen currency).
 * Every other step's Continue/Skip writes to the database immediately, which
 * is what makes "leave and come back later" and "refresh mid-wizard" work —
 * progress lives in Postgres, not just this component's state.
 */
export function OnboardingWizard() {
  const wizard = useOnboardingWizard();
  const [step, setStep] = useState(1);
  const [selections, setSelections] = useState<OnboardingSelections>({});
  const [showSummary, setShowSummary] = useState(false);

  // Seed local state from the server exactly once, when the real (not
  // fail-open-default) row first arrives — seeding from the default before
  // that would always resume at step 1 and lose real progress.
  const seeded = useRef(false);
  useEffect(() => {
    if (wizard.loading || seeded.current) return;
    seeded.current = true;
    setStep(Math.min(Math.max(wizard.step, 1), TOTAL_STEPS));
    setSelections(wizard.selections);
  }, [wizard.loading, wizard.step, wizard.selections]);

  const patch = (p: Partial<OnboardingSelections>) => setSelections((s) => ({ ...s, ...p }));

  const goNext = () => {
    if (step < TOTAL_STEPS) {
      const next = step + 1;
      wizard.saveStep(next, selections);
      setStep(next);
    } else {
      wizard.saveStep(TOTAL_STEPS, selections);
      setShowSummary(true);
    }
  };

  const goSkip = () => {
    if (step < TOTAL_STEPS) {
      const next = step + 1;
      wizard.saveStep(next, {});
      setStep(next);
    } else {
      setShowSummary(true);
    }
  };

  const goBack = () => {
    if (showSummary) {
      setShowSummary(false);
      return;
    }
    if (step > 1) setStep((s) => s - 1);
  };

  if (!seeded.current) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="font-medium text-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        {!showSummary && (
          <>
            <WizardProgress step={step} />

            {step === 1 && (
              <StepProfile
                value={selections}
                onChange={(p) => patch(p)}
              />
            )}
            {step === 2 && (
              <StepIncome
                value={selections}
                currency={selections.currency}
                onChange={(p) => patch(p)}
              />
            )}
            {step === 3 && (
              <StepFinancialPosition value={selections} onChange={(p) => patch(p)} />
            )}
            {step === 4 && <StepGoals value={selections} onChange={(p) => patch(p)} />}
            {step === 5 && <StepHabits value={selections} onChange={(p) => patch(p)} />}

            <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={goBack}
                disabled={step === 1}
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              <div className="flex items-center gap-2">
                {step > 1 && (
                  <Button variant="ghost" size="sm" onClick={goSkip} disabled={wizard.saving}>
                    Skip
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={goNext}
                  disabled={wizard.saving || !canProceed(step, selections)}
                >
                  {step < TOTAL_STEPS ? "Continue" : "Review"}
                </Button>
              </div>
            </div>
          </>
        )}

        {showSummary && (
          <Summary selections={selections} busy={wizard.saving} onFinish={() => wizard.complete(selections)} />
        )}
      </div>
    </div>
  );
}
