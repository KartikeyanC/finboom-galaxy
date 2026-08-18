import { SelectableTile } from "../SelectableTile";
import { OnboardingQuestion } from "../OnboardingQuestion";
import {
  GOAL_TYPES,
  GOALS_MAX,
  TIMELINES,
  INSURANCE_TYPES,
  toggleInList,
  type GoalType,
  type Timeline,
  type InsuranceType,
} from "@/lib/onboardingWizard";

export interface StepGoalsValue {
  goals?: GoalType[];
  goalTimeline?: Timeline;
  insurance?: InsuranceType[];
}

export function StepGoals({
  value,
  onChange,
}: {
  value: StepGoalsValue;
  onChange: (patch: Partial<StepGoalsValue>) => void;
}) {
  const goalsCount = value.goals?.length ?? 0;
  const atGoalsMax = goalsCount >= GOALS_MAX;

  return (
    <div className="space-y-6">
      <OnboardingQuestion
        title="What are you working toward?"
        hint={`Pick up to ${GOALS_MAX} · ${goalsCount}/${GOALS_MAX} selected`}
      >
        <div className="flex flex-wrap gap-2">
          {GOAL_TYPES.map((o) => {
            const active = !!value.goals?.includes(o.id);
            return (
              <SelectableTile
                key={o.id}
                variant="pill"
                label={o.label}
                active={active}
                disabled={atGoalsMax && !active}
                onClick={() => onChange({ goals: toggleInList(value.goals, o.id, GOALS_MAX) })}
              />
            );
          })}
        </div>
      </OnboardingQuestion>

      <OnboardingQuestion title="How soon?">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {TIMELINES.map((o) => (
            <SelectableTile
              key={o.id}
              label={o.label}
              active={value.goalTimeline === o.id}
              onClick={() => onChange({ goalTimeline: o.id })}
            />
          ))}
        </div>
      </OnboardingQuestion>

      <OnboardingQuestion title="Do you have insurance?" hint="Select all that apply.">
        <div className="flex flex-wrap gap-2">
          {INSURANCE_TYPES.map((o) => (
            <SelectableTile
              key={o.id}
              variant="pill"
              label={o.label}
              active={!!value.insurance?.includes(o.id)}
              onClick={() => onChange({ insurance: toggleInList(value.insurance, o.id) })}
            />
          ))}
        </div>
      </OnboardingQuestion>
    </div>
  );
}
