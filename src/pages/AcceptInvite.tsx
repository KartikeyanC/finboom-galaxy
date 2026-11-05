import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { FinrootLogo } from "@/components/brand/FinrootLogo";
import { toUserMessage } from "@/lib/errorMessages";
import { clearPendingInvite, savePendingInvite } from "@/lib/pendingInvite";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Stage 3.8 — `/invite/:token`.
 *
 * The link is the invitation. Because `send-email` is deliberately not deployed
 * (BUG-005), the inviter shares this URL themselves, so it has to work for a
 * cold visitor:
 *
 *   signed in  → accept immediately
 *   signed out → keep the token, send them to sign in / sign up, come back
 *
 * A user who signs up with the invited address does not even need to return:
 * `handle_new_user` claims the invitation on signup. The token then reads as
 * used, and this page says they joined at sign-up rather than showing an error.
 */
export default function AcceptInvite() {
  const { token = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { refresh } = useTenant();
  const navigate = useNavigate();

  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Email sign-in comes straight back via `from`; Google and the sign-up
      // confirmation mail land on /app, where ProtectedRoute picks the saved
      // token up (pendingInvite.ts).
      savePendingInvite(token);
      navigate("/auth", { replace: true, state: { from: { pathname: `/invite/${token}` } } });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
      if (cancelled) return;
      clearPendingInvite();

      if (error) {
        // Signing up with the invited address already claimed the invitation
        // (handle_new_user), so the token reads as used. That is a success.
        const joined = await joinedAtSignup(user.id, user.created_at);
        if (cancelled) return;
        if (joined) {
          await refresh?.();
          setState("ok");
          setMessage(`You were added to ${joined} when you created your account.`);
          return;
        }
        setState("error");
        setMessage(toUserMessage(error, "That invitation link is not valid any more."));
        return;
      }
      // Membership changed, so the workspace list has to be re-read before the
      // app can show it.
      await refresh?.();
      setState("ok");
      setMessage(
        (data as { role?: string } | null)?.role
          ? `You now have ${(data as { role: string }).role} access.`
          : "You have been added to the workspace.",
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, token, navigate, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl text-center space-y-4">
        <FinrootLogo className="h-12 w-auto block mx-auto text-primary" />

        {state === "working" && (
          <>
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
            <h1 className="font-display text-lg font-semibold text-foreground">
              Accepting your invitation…
            </h1>
          </>
        )}

        {state === "ok" && (
          <>
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
            <h1 className="font-display text-lg font-semibold text-foreground">
              You&rsquo;re in
            </h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button className="w-full" onClick={() => navigate("/app")}>
              Open FinRoot
            </Button>
          </>
        )}

        {state === "error" && (
          <>
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
            <h1 className="font-display text-lg font-semibold text-foreground">
              This link didn&rsquo;t work
            </h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">
              Invitations expire, can only be used once, and only work for the address they
              were sent to. Ask whoever invited you to send a new one.
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/app">Go to FinRoot</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * For an account made in the last day: the name of a workspace it joined as a
 * member rather than an owner, i.e. one an invitation added it to at sign-up.
 */
async function joinedAtSignup(userId: string, createdAt?: string): Promise<string | null> {
  if (!createdAt || Date.now() - new Date(createdAt).getTime() > 86_400_000) return null;
  const { data } = await supabase
    .from("tenant_members")
    .select("role, tenants(name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .neq("role", "owner")
    .limit(1);
  const row = data?.[0] as { tenants?: { name?: string } | null } | undefined;
  return row ? row.tenants?.name || "the workspace" : null;
}
