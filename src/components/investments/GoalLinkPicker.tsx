import { Link } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { useGoals } from "@/hooks/useGoals";
import { cn } from "@/lib/utils";

/**
 * Which of the workspace's goals this holding counts toward (goalHoldings.ts).
 * An older holding linked by label ("Retirement") shows the goal that label
 * matches as chosen.
 */
export function GoalLinkPicker({
  goalId,
  legacyLabel,
  onChange,
}: {
  goalId: string | undefined;
  legacyLabel: string;
  onChange: (goalId: string | null) => void;
}) {
  const { data: goals = [] } = useGoals();
  const open = goals.filter((g) => g.status !== "completed" || g.id === goalId);
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const chosen =
    goalId ||
    (legacyLabel &&
      (goals.find((g) => norm(g.title) === norm(legacyLabel)) ??
        goals.find((g) => norm(g.category) === norm(legacyLabel)))?.id) ||
    "";

  return (
    <div className="border-t pt-4">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Counts toward a goal</Label>
      {open.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-2">
          No goals yet.{" "}
          <Link to="/app/goals" className="text-primary underline underline-offset-2">
            Set one up
          </Link>{" "}
          and link this holding to it.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mt-2">
            {open.map((g) => {
              const active = chosen === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(active ? null : g.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-full border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:text-foreground border-border",
                  )}
                >
                  {g.title}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Its value today counts toward the goal, so don't also add this money to the goal by hand.
          </p>
        </>
      )}
    </div>
  );
}
