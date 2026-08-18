import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useOnboardingWizard } from "@/hooks/useOnboardingWizard";
import type { Priority } from "@/lib/onboardingWizard";

const PRIORITY_TIP: Record<Priority, { text: string; href: string; cta: string }> = {
  save_more: { text: "You said you want to save more.", href: "/app/budget", cta: "See your budget" },
  reduce_spending: { text: "You said you want to reduce spending.", href: "/app/expenses", cta: "Review your spending" },
  invest_more: { text: "You said you want to invest more.", href: "/app/investments", cta: "Explore investments" },
  pay_off_debt: { text: "You said paying off debt matters most.", href: "/app/accounts", cta: "Track what you owe" },
  build_emergency_fund: { text: "You said building an emergency fund matters most.", href: "/app/goals", cta: "Start that goal" },
  financial_freedom: { text: "You said financial freedom is the goal.", href: "/app/net-worth", cta: "Watch your net worth" },
};

/**
 * Stage 6.1 — the one concrete "connect the wizard to dashboard
 * personalization" touchpoint (kept deliberately small, per the product's
 * own framing that detailed work happens inside the real modules). Reads
 * `onboarding_selections.topPriority`; renders nothing if it was skipped.
 *
 * Dismissal is local-component state only, on purpose — this is a one-time
 * nicety, not state worth a `deviceLocal.ts` registry entry or a database
 * round trip for.
 */
export function PersonalizedWelcome() {
  const { selections } = useOnboardingWizard();
  const [dismissed, setDismissed] = useState(false);

  const priority = selections.topPriority;
  if (!priority || dismissed) return null;
  const tip = PRIORITY_TIP[priority];

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <p className="truncate text-sm text-foreground">{tip.text}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          to={tip.href}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {tip.cta} <ArrowRight className="h-3 w-3" />
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
