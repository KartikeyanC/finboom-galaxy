import { LifeBuoy, ArrowRight, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useSubscription } from "@/hooks/useSubscription";
import { SUPPORT_EMAIL, SUPPORT_RESPONSE, buildStamp, supportMailto } from "@/lib/support";

/**
 * Stage 5.7 — the way out of the app when something is wrong.
 *
 * The mail link carries the workspace and build details, so the first reply can
 * be an answer rather than a request for more information. It is a `mailto:`,
 * not a form: nothing is collected or transmitted by the app, and the user sees
 * every line before they send it.
 */
export default function SupportCard() {
  const { user } = useAuth();
  const { current } = useTenant();
  const { data: sub } = useSubscription();

  const href = supportMailto({
    subject: "FinRoot support",
    context: {
      email: user?.email ?? null,
      userId: user?.id ?? null,
      workspaceId: current?.tenantId ?? null,
      workspaceName: current?.name ?? null,
      planName: sub?.plan_name ?? null,
      path: typeof window !== "undefined" ? window.location.pathname : null,
      build: buildStamp(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    },
  });

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <LifeBuoy className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-display font-semibold text-foreground text-sm">Help &amp; support</p>
          <p className="text-xs text-muted-foreground mt-0.5">{SUPPORT_RESPONSE}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={href}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <LifeBuoy className="w-4 h-4" /> Email {SUPPORT_EMAIL}
        </a>
        <Link
          to="/support"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          What to include <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link
          to="/status"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Activity className="w-3.5 h-3.5" /> Service status
        </Link>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        The mail opens with your workspace id, plan and build already filled in — read it before you
        send, and delete anything you would rather not share. We will never ask for your password,
        your PIN or a one-time code.
      </p>
    </div>
  );
}
