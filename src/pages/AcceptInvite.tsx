import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { FinrootLogo } from "@/components/brand/FinrootLogo";
import { toUserMessage } from "@/lib/errorMessages";
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
 * `handle_new_user` claims the invitation on signup. This page then reports
 * "already a member", which is the truth rather than an error.
 */
const PENDING_KEY = "finroot.pendingInvite";

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
      // Survive the round trip through auth. sessionStorage, not localStorage:
      // an invitation is for this visit, not something to leave on the device.
      try {
        sessionStorage.setItem(PENDING_KEY, token);
      } catch {
        /* private mode — they can re-open the link */
      }
      navigate("/auth", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
      if (cancelled) return;

      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* ignore */
      }

      if (error) {
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
        <FinrootLogo className="w-12 h-12 mx-auto rounded-xl" />

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
