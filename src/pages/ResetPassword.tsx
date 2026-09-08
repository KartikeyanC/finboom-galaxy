import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { markUnlocked, setPasswordAuthNow } from "@/lib/appLock";
import { Sprout } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // BUG-099 — an expired or already-used link left this page saying
  // "Waiting…" forever: the security property (it can't set a password)
  // held, but there was no way to tell that apart from "no link at all".
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    // Supabase redirects an expired/already-used link back here with
    // `#error=...&error_code=...` in the hash instead of a usable token —
    // no PASSWORD_RECOVERY event ever fires for it, so that's checked first.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    if (hashParams.get("error") || searchParams.get("error")) {
      setLinkInvalid(true);
      return;
    }

    // A link with no error param that still never produces a session (a
    // stripped/mangled URL, a browser extension eating the hash, etc.)
    // deserves the same clear message rather than an indefinite spinner.
    const timeout = window.setTimeout(() => setLinkInvalid(true), 15000);
    const becomeReady = () => {
      window.clearTimeout(timeout);
      setReady(true);
    };

    // BUG-008 — this page must only open the "set a new password" form for a
    // genuine recovery, never just because someone who is already signed in
    // navigated here. A real reset link carries recovery params in the URL
    // (hash `type=recovery` / `access_token`, or a PKCE `?code=`); the SDK
    // consumes them and fires PASSWORD_RECOVERY.
    const hasRecoveryParams =
      hashParams.get("type") === "recovery" ||
      hashParams.has("access_token") ||
      searchParams.has("code");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") becomeReady();
    });
    // The SDK sometimes finishes consuming the hash before this listener is
    // attached. Only fall back to the current session when this load actually
    // carried recovery params — a plain existing session is not a reset.
    if (hasRecoveryParams) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) becomeReady();
      });
    }
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = z.string().min(8, "Password must be at least 8 characters").max(72).safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.updateUser({ password: parsed.data });
    setBusy(false);
    if (error) {
      notifyError(error);
      return;
    }
    // Unlock explicitly rather than through the sign-in marker (BUG-090): this
    // arrives as USER_UPDATED, not SIGNED_IN, so a marker left here would sit
    // unspent until some later session restore picked it up. Setting a new
    // password is the strongest thing the lock could ask for, so it counts as
    // the password sign-in the 12-hour rule is measured from.
    if (data.user) {
      setPasswordAuthNow(data.user.id);
      markUnlocked(data.user.id);
    }
    toast.success("Password updated. You're signed in.");
    navigate("/app", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sprout className="h-5 w-5" />
          </div>
          {/* Brand mark, not the page heading — the CardTitle below is the <h1>. */}
          <span className="text-2xl font-semibold tracking-tight">FinRoot</span>
        </div>
        <Card>
          {linkInvalid ? (
            <>
              <CardHeader>
                <CardTitle as="h1">This link isn't working</CardTitle>
                <CardDescription>
                  Password reset links expire after a while, and each one only works once. Request
                  a fresh one and it'll work the same way.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link to="/auth">Back to sign in</Link>
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle as="h1">Set a new password</CardTitle>
                <CardDescription>
                  {ready
                    ? "Choose a strong password to finish resetting your account."
                    : "Waiting for your secure reset link to be verified…"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <PasswordInput
                      id="new-password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={!ready}
                    />
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy || !ready}>
                    {busy ? "Updating…" : "Update password"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;