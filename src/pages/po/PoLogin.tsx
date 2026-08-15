import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { clearSignInIntent, markSignInIntent } from "@/lib/appLock";

export default function PoLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPO } = usePlatformAdmin();

  const [useSecret, setUseSecret] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password,   setPassword]   = useState("");
  const [secret,     setSecret]     = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [resetBusy,  setResetBusy]  = useState(false);

  // Already signed in as a PO → go straight in.
  useEffect(() => {
    if (user && isPO) navigate("/po", { replace: true });
  }, [user, isPO, navigate]);

  // BUG-090: clearing the marker on every failure matters more here than on the
  // customer sign-in, because both paths below bail out at several points
  // before Supabase is ever asked for a session.
  const fail = (m: string) => { clearSignInIntent(); toast.error(m); setBusy(false); };

  const finish = async () => {
    const { data, error } = await supabase.rpc("is_platform_admin");
    if (error || !data) {
      await supabase.auth.signOut();
      return fail("This account is not a Product Owner.");
    }
    toast.success("Welcome back");
    navigate("/po", { replace: true });
  };

  const signInPassword = async () => {
    if (!identifier) return toast.error("Enter your login identifier");
    if (!password)   return toast.error("Enter your password");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("po-auth", {
      body: { mode: "resolve", identifier },
    });
    if (error || !data?.email) return fail(data?.error ?? "No Product Owner account matches that login");
    markSignInIntent(); // BUG-090 — see `markSignInIntent`
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: data.email, password });
    if (signErr) return fail(signErr.message);
    await finish();
  };

  const signInSecret = async () => {
    if (!identifier) return toast.error("Enter your login identifier");
    if (secret.length < 16) return toast.error(`Secret code is incomplete — ${16 - secret.length} digit${16 - secret.length !== 1 ? "s" : ""} missing`);
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("po-auth", {
      body: { mode: "secret", identifier, secret },
    });
    if (error || !data?.token_hash) return fail(data?.error ?? "Invalid secret access code");
    markSignInIntent(); // BUG-090 — see `markSignInIntent`
    const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
    if (vErr) return fail(vErr.message);
    await finish();
  };

  const sendReset = async () => {
    if (!identifier) return toast.error("Enter your email or identifier first");
    setResetBusy(true);
    // Resolve identifier (email / username / User ID / Number ID) → account email.
    const { data, error } = await supabase.functions.invoke("po-auth", {
      body: { mode: "resolve", identifier },
    });
    if (error || !data?.email) {
      setResetBusy(false);
      return toast.error(data?.error ?? "No Product Owner account matches that login");
    }
    const { error: rErr } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetBusy(false);
    if (rErr) return notifyError(rErr);
    toast.success("Password reset link sent — check your email. No email? Use your 16-digit secret code instead.");
  };

  /* switch mode → clear credentials */
  const switchMode = () => {
    setUseSecret(v => !v);
    setSecret("");
    setPassword("");
    setShowPw(false);
    setShowSecret(false);
  };

  const secretComplete = secret.length === 16;
  const secretMissing  = secret.length > 0 && !secretComplete;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card/70 backdrop-blur p-8 space-y-5">

        {/* header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-semibold">Product Owner</h1>
          <p className="text-sm text-muted-foreground">
            {useSecret
              ? "Sign in with your identifier and 16-digit secret code."
              : "Sign in with your email, username, User ID or Number ID."}
          </p>
        </div>

        <div className="space-y-3">

          {/* identifier */}
          <div className="space-y-1.5">
            <Label htmlFor="po-id">Email / Username / User ID / Number ID</Label>
            <Input
              id="po-id"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              autoFocus
            />
          </div>

          {/* password mode */}
          {!useSecret && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="po-pw">Password</Label>
                <button
                  type="button"
                  onClick={sendReset}
                  disabled={resetBusy}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {resetBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                  {resetBusy ? "Sending…" : "Forgot password?"}
                </button>
              </div>
              <div className="relative">
                <Input
                  id="po-pw"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && signInPassword()}
                  className="pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPw(v => !v)}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {/* secret mode */}
          {useSecret && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="po-secret">16-digit Secret Access Code</Label>
                {/* Stage 4.8: tied to the field with aria-describedby rather
                    than made a live region. It updates on every one of sixteen
                    keystrokes, so announcing each change would talk over the
                    typing it is meant to help with; described-by makes the
                    count available on focus and on demand instead. */}
                <span
                  id="po-secret-count"
                  className={`text-xs font-mono tabular-nums
                  ${secretComplete ? "text-emerald-500" : secretMissing ? "text-amber-500" : "text-muted-foreground"}`}
                >
                  {secret.length}/16
                </span>
              </div>

              <div className="relative">
                <Input
                  id="po-secret"
                  inputMode="numeric"
                  aria-describedby="po-secret-count"
                  type={showSecret ? "text" : "password"}
                  value={secret}
                  onChange={e => setSecret(e.target.value.replace(/\D/g, "").slice(0, 16))}
                  onKeyDown={e => e.key === "Enter" && signInSecret()}
                  placeholder="Enter 16 digits"
                  autoComplete="one-time-code"
                  className={`pr-10 font-mono tracking-widest
                    ${secretComplete  ? "border-emerald-500/60 focus-visible:ring-emerald-500/30" : ""}
                    ${secretMissing   ? "border-amber-500/60"  : ""}`}
                  maxLength={16}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret(v => !v)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* digit progress bar */}
              <div className="flex gap-0.5 pt-0.5">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors
                    ${i < secret.length
                      ? secretComplete ? "bg-emerald-500" : "bg-amber-500"
                      : "bg-border"}`}
                  />
                ))}
              </div>

              {secretMissing && (
                <p className="text-xs text-amber-500">
                  {16 - secret.length} more digit{16 - secret.length !== 1 ? "s" : ""} needed
                </p>
              )}
              {secretComplete && (
                <p className="text-xs text-emerald-500">✓ Code complete — ready to sign in</p>
              )}
            </div>
          )}

          {/* submit */}
          <Button
            className="w-full"
            disabled={busy || (useSecret && !secretComplete)}
            onClick={useSecret ? signInSecret : signInPassword}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>

          {/* toggle mode */}
          <button
            type="button"
            className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition-colors"
            onClick={switchMode}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {useSecret ? "Use password instead" : "Use 16-digit secret access code"}
          </button>
        </div>
      </div>
    </div>
  );
}
