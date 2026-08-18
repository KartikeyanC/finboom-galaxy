import { SelectableTile } from "../SelectableTile";
import { OnboardingQuestion } from "../OnboardingQuestion";
import {
  SPEND_CATEGORIES,
  SPEND_CATEGORIES_MAX,
  PRIORITIES,
  toggleInList,
  type SpendCategory,
  type Priority,
} from "@/lib/onboardingWizard";

export interface StepHabitsValue {
  topSpendCategories?: SpendCategory[];
  topPriority?: Priority;
}

export function StepHabits({
  value,
  onChange,
}: {
  value: StepHabitsValue;
  onChange: (patch: Partial<StepHabitsValue>) => void;
}) {
  const spendCount = value.topSpendCategories?.length ?? 0;
  const atSpendMax = spendCount >= SPEND_CATEGORIES_MAX;

  return (
    <div className="space-y-6">
      <OnboardingQuestion
        title="Where does most of your money go?"
        hint={`Pick your top ${SPEND_CATEGORIES_MAX} · ${spendCount}/${SPEND_CATEGORIES_MAX} selected`}
      >
        <div className="flex flex-wrap gap-2">
          {SPEND_CATEGORIES.map((o) => {
            const active = !!value.topSpendCategories?.includes(o.id);
            return (
              <SelectableTile
                key={o.id}
                variant="pill"
                label={o.label}
                active={active}
                disabled={atSpendMax && !active}
                onClick={() =>
                  onChange({
                    topSpendCategories: toggleInList(
                      value.topSpendCategories,
                      o.id,
                      SPEND_CATEGORIES_MAX,
                    ),
                  })
                }
              />
            );
          })}
        </div>
      </OnboardingQuestion>

      <OnboardingQuestion title="What is your biggest financial priority?">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRIORITIES.map((o) => (
            <SelectableTile
              key={o.id}
              label={o.label}
              active={value.topPriority === o.id}
              onClick={() => onChange({ topPriority: o.id })}
            />
          ))}
        </div>
      </OnboardingQuestion>
    </div>
  );
}
