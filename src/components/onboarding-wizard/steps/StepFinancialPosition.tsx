import { SelectableTile } from "../SelectableTile";
import { OnboardingQuestion } from "../OnboardingQuestion";
import {
  ASSET_TYPES,
  LIABILITY_TYPES,
  toggleInList,
  type AssetType,
  type LiabilityType,
} from "@/lib/onboardingWizard";

export interface StepFinancialPositionValue {
  assets?: AssetType[];
  liabilities?: LiabilityType[];
}

export function StepFinancialPosition({
  value,
  onChange,
}: {
  value: StepFinancialPositionValue;
  onChange: (patch: Partial<StepFinancialPositionValue>) => void;
}) {
  return (
    <OnboardingQuestion
      title="What do you currently have?"
      hint="Just what you hold, not how much — details come later."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Assets</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ASSET_TYPES.map((o) => (
              <SelectableTile
                key={o.id}
                label={o.label}
                active={!!value.assets?.includes(o.id)}
                onClick={() => onChange({ assets: toggleInList(value.assets, o.id) })}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Liabilities</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LIABILITY_TYPES.map((o) => (
              <SelectableTile
                key={o.id}
                label={o.label}
                active={!!value.liabilities?.includes(o.id)}
                onClick={() => onChange({ liabilities: toggleInList(value.liabilities, o.id) })}
              />
            ))}
          </div>
        </div>
      </div>
    </OnboardingQuestion>
  );
}
