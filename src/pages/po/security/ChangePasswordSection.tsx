import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";

/**
 * Change the Product Owner account password by proving knowledge of the
 * 16-digit secret — split out of PoSecurity.tsx in Stage 4.13.
 *
 * The secret is verified server-side; nothing here decides whether the change
 * is allowed. `hasSecret` only governs what the section says to the operator
 * when no secret has been set yet.
 */
/* ── change password via 16-digit secret ────────────────────────────────────── */

export default function ChangePasswordSection({ hasSecret }: { hasSecret: boolean }) {
  const { user } = useAuth();
  const [pw, setPw]           = useState("");
  const [confirm, setConfirm] = useState("");
  const [secret, setSecret]   = useState("");
  const [show, setShow]       = useState(false);
  const [busy, setBusy]       = useState(false);
  const [checking, setChecking] = useState(false);
  const [codeValid, setCodeValid] = useState(false);   // live-verified secret

  const pwOk      = pw.length >= 8;
  const matchOk   = pw.length > 0 && pw === confirm;
  const secretOk  = secret.length === 16;
  // Save unlocks only when the code has been verified as CORRECT.
  const canSave   = pwOk && matchOk && codeValid;

  // Live-verify the 16-digit code the moment all 16 digits are present.
  useEffect(() => {
    if (!user?.email || secret.length !== 16) { setCodeValid(false); setChecking(false); return; }
    let cancelled = false;
    setChecking(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("po-auth", {
        body: { mode: "secret", identifier: user.email, secret },
      });
      if (cancelled) return;
      setChecking(false);
      setCodeValid(!error && !!data?.token_hash);
    })();
    return () => { cancelled = true; };
  }, [secret, user?.email]);

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return notifyError(error);
    setPw(""); setConfirm(""); setSecret(""); setCodeValid(false);
    toast.success("Password changed successfully.");
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-5 space-y-4">
      <div>
        <h2 className="font-medium text-sm flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> Change password
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Enter a new password, then your 16-digit secret code to save. A wrong or empty
          code won't change your password.
        </p>
      </div>

      <div className="space-y-4">
          {!hasSecret && (
            <p className="text-xs text-amber-500">
              No secret code set yet — generate or enter one in the card above; you'll need it to save here.
            </p>
          )}
          {/* new password + confirm */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-pw" className="text-xs text-muted-foreground">New password</Label>
              <Input id="cp-pw" type={show ? "text" : "password"} value={pw}
                onChange={(e) => setPw(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm" className="text-xs text-muted-foreground">Re-enter password</Label>
              <Input id="cp-confirm" type={show ? "text" : "password"} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" autoComplete="new-password"
                className={confirm.length > 0 && !matchOk ? "border-amber-500/60" : ""} />
            </div>
          </div>
          {confirm.length > 0 && !matchOk && (
            <p className="text-xs text-amber-500">Passwords don't match yet.</p>
          )}

          {/* 16-digit code — last, required to save */}
          <div className="space-y-1.5 border-t border-border/50 pt-4">
            <Label htmlFor="cp-secret" className="text-xs text-muted-foreground">
              16-digit secret code ({secret.length}/16) · required to save
            </Label>
            <Input
              id="cp-secret"
              inputMode="numeric"
              type={show ? "text" : "password"}
              value={secret}
              onChange={(e) => setSecret(e.target.value.replace(/\D/g, "").slice(0, 16))}
              placeholder="Enter your 16 digits to confirm"
              className={`font-mono tracking-widest ${codeValid ? "border-emerald-500/60" : secretOk && !checking ? "border-rose-500/60" : secret.length > 0 ? "border-amber-500/60" : ""}`}
            />
            {checking && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Verifying code…
              </p>
            )}
            {!checking && secretOk && codeValid && (
              <p className="text-xs text-emerald-500 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Code correct — you can save now</p>
            )}
            {!checking && secretOk && !codeValid && (
              <p className="text-xs text-rose-500">Incorrect code — password won't change.</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" className="gap-2" onClick={submit} disabled={!canSave || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Save new password
            </Button>
            <button type="button" onClick={() => setShow((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>
    </div>
  );
}

/* ── component ─────────────────────────────────────────────────────────────── */
