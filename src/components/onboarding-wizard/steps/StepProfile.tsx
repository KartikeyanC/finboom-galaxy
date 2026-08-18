import { SelectableTile } from "../SelectableTile";
import { OnboardingQuestion } from "../OnboardingQuestion";
import {
  AGE_RANGES,
  COUNTRIES,
  CURRENCIES,
  type AgeRange,
  type Country,
  type Currency,
} from "@/lib/onboardingWizard";

export interface StepProfileValue {
  ageRange?: AgeRange;
  country?: Country;
  currency?: Currency;
}

export function StepProfile({
  value,
  onChange,
}: {
  value: StepProfileValue;
  onChange: (patch: Partial<StepProfileValue>) => void;
}) {
  return (
    <OnboardingQuestion title="What best describes you?">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Age</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {AGE_RANGES.map((o) => (
              <SelectableTile
                key={o.id}
                label={o.label}
                active={value.ageRange === o.id}
                onClick={() => onChange({ ageRange: o.id })}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Country</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COUNTRIES.map((o) => (
              <SelectableTile
                key={o.id}
                label={o.label}
                active={value.country === o.id}
                onClick={() => onChange({ country: o.id })}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Currency</p>
          <div className="grid grid-cols-3 gap-2">
            {CURRENCIES.map((o) => (
              <SelectableTile
                key={o.id}
                label={o.label}
                active={value.currency === o.id}
                onClick={() => onChange({ currency: o.id })}
              />
            ))}
          </div>
        </div>
      </div>
    </OnboardingQuestion>
  );
}
