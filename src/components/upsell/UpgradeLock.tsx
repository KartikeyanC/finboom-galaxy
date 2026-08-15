import { Link } from "react-router-dom";
import { ArrowRight, Lock, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/contexts/AccessContext";
import { useTenant } from "@/contexts/TenantContext";
import { useMenuLocks } from "@/hooks/useMenuLocks";
import { ACCESS_MENUS } from "@/lib/accessMenus";
import { menuBlurb, type PlanCatalogueRow } from "@/lib/menuUpsell";
import { contactUpgradeHref, paymentsConfigured } from "@/lib/payments";
import { formatPlanPrice } from "@/lib/pricing";

/**
 * Stage 5.5 — what a plan-locked feature looks like from the inside.
 *
 * It replaces a redirect. Bouncing somebody who opened `/app/investments` to
 * the dashboard tells them nothing: not that the feature exists, not that it
 * is on a higher plan, and not what to do about it. This page says all three
 * without pretending the feature is broken.
 *
 * It is deliberately reachable — MenuGuard renders it in place — so a link
 * from marketing, a bookmark or the sidebar all land somewhere that sells.
 */
export function UpgradeLock({ menuId }: { menuId: string }) {
  const { lockOf, currentPlan, canUpgrade } = useMenuLocks();
  const { current } = useTenant();
  const { canAccess } = useAccess();
  const lock = lockOf(menuId);

  if (lock.kind !== "plan") return null;

  const label = ACCESS_MENUS.find((m) => m.id === menuId)?.label ?? menuId;
  const target: PlanCatalogueRow | null = lock.upgrade;
  const price = target ? formatPlanPrice(target) : null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6" data-testid="upgrade-lock">
      <div className="max-w-lg w-full rounded-2xl border border-primary/25 bg-card/70 backdrop-blur p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {currentPlan ? `You are on ${currentPlan.name}` : "Not on your plan"}
            </p>
            <h1 className="font-display text-xl font-semibold text-foreground">
              {target ? `${label} is part of ${target.name}` : `${label} is not on your plan`}
            </h1>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {menuBlurb(menuId, label)}
        </p>

        {target && price && (
          <div className="flex items-baseline gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-3">
            <span className="font-display text-2xl font-bold text-foreground">{price.price}</span>
            <span className="text-sm text-muted-foreground">{price.period}</span>
            <span className="text-xs text-muted-foreground ml-auto">{target.name} plan</span>
          </div>
        )}

        {/* Who can actually act on this. An "Upgrade" button shown to a viewer
            who cannot change the subscription is a dead end dressed as a CTA. */}
        {canUpgrade ? (
          <div className="space-y-2">
            {paymentsConfigured() && canAccess("billing") ? (
              <Button asChild className="w-full gap-2">
                <Link to="/app/billing">
                  <Sparkles className="h-4 w-4" />
                  {target ? `Upgrade to ${target.name}` : "See plans"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              // No gateway configured (Stage 2.11): upgrades are arranged by
              // hand, so the honest button is the one that starts that email.
              <Button asChild className="w-full gap-2">
                <a href={contactUpgradeHref(target?.name, current?.name ?? null)}>
                  <Mail className="h-4 w-4" />
                  {target ? `Ask us to switch on ${target.name}` : "Ask us about plans"}
                </a>
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground text-center">
              Nothing changes until you confirm. Your data stays exactly as it is.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground rounded-xl border border-border/60 bg-background/40 px-4 py-3">
            Only the owner of{" "}
            <span className="text-foreground font-medium">{current?.name ?? "this workspace"}</span>{" "}
            can change the plan — ask them to enable {label}.
          </p>
        )}
      </div>
    </div>
  );
}

export default UpgradeLock;
