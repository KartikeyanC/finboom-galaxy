import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOTAL_STEPS } from "@/lib/onboardingWizard";

const STEP_LABELS = ["Profile", "Income", "Position", "Goals", "Habits"];

/** 5-node numbered stepper, adapted from the inline pattern in po/tenants/AddTenantDialog.tsx. */
export function WizardProgress({ step }: { step: number }) {
  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={`Step ${step} of ${TOTAL_STEPS}`}
    >
      {STEP_LABELS.map((label, i) => {
        const s = i + 1;
        return (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : s < step
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {s < step ? <Check className="h-3 w-3" strokeWidth={3} /> : s}
              </div>
              <span
                className={cn(
                  "hidden text-[11px] sm:inline",
                  step === s ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {s < TOTAL_STEPS && <div className="mx-2 h-px flex-1 bg-border/60" />}
          </div>
        );
      })}
    </div>
  );
}
