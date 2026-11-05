import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Mail, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useAccountDeletion } from "@/hooks/useAccountDeletion";
import { deletionState } from "@/lib/accountDeletion";
import { PRIVACY_CONTACT } from "@/lib/legal";

const CONFIRM_WORD = "DELETE";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/**
 * Stage 5.2 — deleting your account, from here.
 *
 * The click records a request (request_account_deletion), not a deletion:
 * removing the sign-in and the uploaded files needs a service_role step the
 * browser must never have, so an operator completes it after the 30-day
 * recovery window (docs/runbooks/account-deletion.md). Being signed in is
 * the proof of identity an emailed request never had. Until the window ends
 * the person can cancel, and the card says so in dates, not durations.
 *
 * If the request table can't be read at all, the card falls back to the
 * emailed request rather than offering a button that might silently fail.
 */
export default function DeleteAccountCard() {
  const { user } = useAuth();
  const { memberships } = useTenant();
  const { row, loading, failed, request, cancel } = useAccountDeletion();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  const ownedWorkspaces = memberships.filter((m) => m.role === "owner");
  const state = deletionState(row, new Date());

  const mailto =
    `mailto:${PRIVACY_CONTACT}` +
    `?subject=${encodeURIComponent("Account deletion request")}` +
    `&body=${encodeURIComponent(
      `I would like my FinRoot account and its data deleted.\n\nAccount email: ${user?.email ?? ""}\nAccount id: ${user?.id ?? ""}`,
    )}`;

  const submit = async () => {
    await request.mutateAsync();
    setConfirming(false);
    setTyped("");
    toast.success("Deletion requested — you can cancel any time in the next 30 days");
  };

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

      {state.kind === "pending" || state.kind === "due" ? (
        <div className="space-y-3" role="status">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-1.5">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-destructive" /> Deletion requested on {day(state.requestedAt)}
            </p>
            <p className="text-sm text-muted-foreground">
              {state.kind === "pending" ? (
                <>
                  Your account and data will be deleted after{" "}
                  <strong className="text-foreground">{day(state.purgeAfter)}</strong> ({state.daysLeft}{" "}
                  {state.daysLeft === 1 ? "day" : "days"} from now). Until then everything works as normal.
                </>
              ) : (
                <>The recovery window has ended; your account will be deleted shortly and you'll get an email when it is done.</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={cancel.isPending}
              onClick={async () => {
                await cancel.mutateAsync();
                toast.success("Deletion cancelled — your account stays");
              }}
            >
              Cancel the deletion
            </Button>
            <Link to="/app/export" className="text-sm text-primary underline underline-offset-2">
              Download your data
            </Link>
          </div>
        </div>
      ) : !confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={loading}
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
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
              <li>Nothing is deleted for 30 days, and you can cancel until then. After that it cannot be undone.</li>
            </ul>
          </div>

          {failed ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Requests can't be sent from here right now, so send it by email instead. We confirm it is
                you, then act within 30 days.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="gap-2">
                  <a href={mailto}>
                    <Mail className="w-4 h-4" /> Email the request
                  </a>
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim().toUpperCase() === CONFIRM_WORD) void submit();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="delete-confirm" className="text-sm">
                  Type <strong>{CONFIRM_WORD}</strong> to confirm
                </Label>
                <Input
                  id="delete-confirm"
                  autoComplete="off"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={typed.trim().toUpperCase() !== CONFIRM_WORD || request.isPending}
                >
                  Request deletion
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setConfirming(false); setTyped(""); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
