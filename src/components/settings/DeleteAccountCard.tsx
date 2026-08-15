import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Copy, Mail, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { PRIVACY_CONTACT } from "@/lib/legal";

/**
 * Stage 5.2 — the account-deletion route, told honestly.
 *
 * The self-service button is NOT here yet: erasing an account needs a
 * `service_role` step that the browser must never have (deleting the auth
 * user, draining the workspace's uploaded files), and the migration that adds
 * the request queue is written but not yet applied — see
 * `supabase/migrations/20260811130000_stage5_account_deletion.sql` and
 * `docs/runbooks/account-deletion.md`.
 *
 * Shipping a button that called a missing RPC would be worse than shipping
 * this: the user would click "delete my account", get an error, and have no
 * idea whether it worked. So this card does the two things that are true
 * today — it explains exactly what deletion will do, and it composes the
 * request with the identifiers an operator needs. Replace the mailto with the
 * real button once the migration is live.
 */
export default function DeleteAccountCard() {
  const { user } = useAuth();
  const { current, memberships } = useTenant();
  const [confirming, setConfirming] = useState(false);

  const ownedWorkspaces = memberships.filter((m) => m.role === "owner");
  const accountRef = user?.id ?? "";

  const body = [
    "I would like my FinRoot account and its data deleted.",
    "",
    `Account email: ${user?.email ?? "(signed out)"}`,
    `Account id: ${accountRef}`,
    current ? `Current workspace: ${current.name} (${current.tenantId})` : "",
    ownedWorkspaces.length
      ? `Workspaces I own: ${ownedWorkspaces.map((m) => `${m.name} (${m.tenantId})`).join(", ")}`
      : "",
    "",
    "I understand this is permanent after the 30-day recovery window.",
  ]
    .filter(Boolean)
    .join("\n");

  const mailto =
    `mailto:${PRIVACY_CONTACT}` +
    `?subject=${encodeURIComponent("Account deletion request")}` +
    `&body=${encodeURIComponent(body)}`;

  return (
    <div className="glass-card p-6 space-y-4 border-destructive/30">
      <div>
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-destructive" /> Delete your account
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your data is yours to remove. Before you do, it is worth knowing exactly what goes.
        </p>
      </div>

      {!confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirming(true)}>
            <AlertTriangle className="w-4 h-4" /> I want to delete my account
          </Button>
          <Link to="/app/export" className="text-sm text-primary underline underline-offset-2">
            Download your data first
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">What deletion does</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Every record in the workspaces you own is removed: transactions, accounts, budgets, goals, investments, insurance and uploaded documents.</li>
              <li>Your sign-in is removed, along with your profile and notifications.</li>
              <li>
                {ownedWorkspaces.length > 0 ? (
                  <>
                    You own{" "}
                    <strong className="text-foreground">
                      {ownedWorkspaces.length} workspace{ownedWorkspaces.length === 1 ? "" : "s"}
                    </strong>
                    . Anyone you invited loses access to them. Transfer ownership first if someone else needs to keep the records.
                  </>
                ) : (
                  <>You do not own any workspace, so nobody else loses access.</>
                )}
              </li>
              <li>There is a 30-day recovery window. After that it cannot be undone.</li>
            </ul>
          </div>

          {/* The self-service button lands with the migration; until then the
              request is by email, and this composes it so nobody has to hunt
              for the identifiers an operator needs. */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Deletion is handled by a person right now, so it goes by email. We confirm it is you,
              then act within 30 days and tell you when it is done.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="gap-2">
                <a href={mailto}>
                  <Mail className="w-4 h-4" /> Compose the request
                </a>
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${PRIVACY_CONTACT}\n\n${body}`);
                    toast.success("Request copied — paste it into your email");
                  } catch {
                    toast.error("Copy failed — select the text and copy it manually");
                  }
                }}
              >
                <Copy className="w-4 h-4" /> Copy instead
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
