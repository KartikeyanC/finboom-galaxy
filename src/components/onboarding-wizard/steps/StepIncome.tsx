import { SelectableTile } from "../SelectableTile";
import { OnboardingQuestion } from "../OnboardingQuestion";
import {
  INCOME_SOURCES,
  incomeRangesFor,
  toggleInList,
  type Currency,
  type IncomeSource,
} from "@/lib/onboardingWizard";

export interface StepIncomeValue {
  incomeSources?: IncomeSource[];
  incomeRange?: string;
}

export function StepIncome({
  value,
  currency,
  onChange,
}: {
  value: StepIncomeValue;
  currency: Currency | undefined;
  onChange: (patch: Partial<StepIncomeValue>) => void;
}) {
  const ranges = incomeRangesFor(currency);
  return (
    <div className="space-y-6">
      <OnboardingQuestion title="How do you earn your money?" hint="Select all that apply.">
        <div className="flex flex-wrap gap-2">
          {INCOME_SOURCES.map((o) => (
            <SelectableTile
              key={o.id}
              variant="pill"
              label={o.label}
              active={!!value.incomeSources?.includes(o.id)}
              onClick={() =>
                onChange({ incomeSources: toggleInList(value.incomeSources, o.id) })
              }
            />
          ))}
        </div>
      </OnboardingQuestion>

      <OnboardingQuestion title="What is your approximate monthly income?">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ranges.map((o) => (
            <SelectableTile
              key={o.id}
              label={o.label}
              active={value.incomeRange === o.id}
              onClick={() => onChange({ incomeRange: o.id })}
            />
          ))}
        </div>
      </OnboardingQuestion>
    </div>
  );
}
