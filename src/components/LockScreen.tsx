import { useEffect, useRef, useState } from "react";
import { Lock, LogOut, KeyRound, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  pinLength,
  verifyPin,
  markUnlocked,
  markSignOutIntent,
  setPasswordAuthNow,
  clearPin,
  setLockChoice,
} from "@/lib/appLock";

/**
 * `pin` — the everyday case.
 * `password` — more than 12 hours since the last password sign-in.
 * `recover` — Stage 5.4: the PIN was forgotten. Same password check, but it
 *   CLEARS the PIN afterwards so the gate asks for a new one. Before this the
 *   only way past a forgotten PIN was signing out, which most people read as
 *   losing their data rather than losing a local convenience.
 */
type LockMode = "pin" | "password" | "recover";

export function LockScreen({ mode, onUnlocked }: { mode: "pin" | "password"; onUnlocked: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const uid = user?.id ?? "";
  const [current, setCurrent] = useState<LockMode>(mode);

  const initials = (
    (user?.user_metadata?.display_name as string | undefined) || user?.email || "U"
  ).slice(0, 2).toUpperCase();

  const fullSignOut = async () => {
    // Same ordering fix as DashboardLayout's Sign out button, and the same
    // reason: navigating before the session actually clears leaves a window
    // where a fresh load of a public route can still find a valid session
    // and bounce back in. markSignOutIntent() is the same button's other
    // half of that fix: it tells ProtectedRoute to stand down instead of
    // racing this navigate() with its own redirect to /auth.
    markSignOutIntent();
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl p-8 space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/60 to-chart-2/60 flex items-center justify-center text-lg font-bold">
            {initials}
          </div>
          <div>
            <div className="font-display text-lg font-semibold flex items-center justify-center gap-1.5">
              <Lock className="w-4 h-4 text-primary" /> Locked
            </div>
            {user?.email && <p className="text-xs text-muted-foreground mt-1 truncate">{user.email}</p>}
          </div>
        </div>

        {current === "pin" ? (
          <>
            <PinForm uid={uid} onUnlocked={onUnlocked} />
            <button
              type="button"
              onClick={() => setCurrent("recover")}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1.5"
            >
              <HelpCircle className="w-3.5 h-3.5" /> Forgot your PIN?
            </button>
          </>
        ) : (
          <PasswordForm
            email={user?.email ?? ""}
            uid={uid}
            recovering={current === "recover"}
            onUnlocked={onUnlocked}
            onBack={mode === "pin" ? () => setCurrent("pin") : undefined}
          />
        )}

        <button
          type="button"
          onClick={fullSignOut}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" /> Not you? Sign out
        </button>
      </div>
    </div>
  );
}

function PinForm({ uid, onUnlocked }: { uid: string; onUnlocked: () => void }) {
  const len = pinLength(uid);
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handle = async (raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, len);
    setVal(v);
    setErr(false);
    if (v.length === len) {
      if (await verifyPin(uid, v)) {
        markUnlocked(uid);
        onUnlocked();
      } else {
        setErr(true);
        setVal("");
        inputRef.current?.focus();
      }
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Enter your {len}-digit PIN</p>
      <div className="relative">
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          value={val}
          onChange={(e) => handle(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-default"
          aria-label="PIN"
        />
        <div className="flex items-center justify-center gap-2.5 pointer-events-none">
          {Array.from({ length: len }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-12 w-10 rounded-lg border flex items-center justify-center text-xl bg-background/60",
                err ? "border-destructive/60" : i < val.length ? "border-primary" : "border-border",
              )}
            >
              {i < val.length ? "•" : ""}
            </div>
          ))}
        </div>
      </div>
      {err && <p className="text-xs text-destructive">Incorrect PIN. Try again.</p>}
    </div>
  );
}

function PasswordForm({
  email,
  uid,
  recovering,
  onUnlocked,
  onBack,
}: {
  email: string;
  uid: string;
  recovering: boolean;
  onUnlocked: () => void;
  onBack?: () => void;
}) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!pwd) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setBusy(false);
    if (error) {
      setErr("Incorrect password.");
      setPwd("");
      return;
    }
    setPasswordAuthNow(uid);
    // Recovery: drop the PIN nobody can remember. The route gate then asks for
    // a new one — the password is the credential that actually proved anything
    // here, so this hands back exactly what was lost and nothing more.
    //
    // The choice is written explicitly first because for anyone who set their
    // PIN under the old mandatory rules it is only INFERRED from the PIN
    // existing — clear the PIN and the app forgets they ever wanted the lock,
    // and greets them with "Add a PIN?" instead of "Choose a new PIN".
    if (recovering) {
      setLockChoice(uid, true);
      clearPin(uid);
    }
    markUnlocked(uid);
    onUnlocked();
  };

  return (
    <div className="space-y-3 text-left">
      <div className="flex items-start gap-1.5 text-sm text-muted-foreground justify-center text-center">
        <KeyRound className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        {recovering
          ? "Enter your password and pick a new PIN — nobody can look the old one up."
          : "It's been over 12 hours — re-enter your password"}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lock-pwd">Password</Label>
        <Input
          id="lock-pwd"
          type="password"
          autoFocus
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button className="w-full" onClick={submit} disabled={busy}>
        {busy ? "Verifying…" : recovering ? "Verify & reset PIN" : "Unlock"}
      </Button>
      {onBack && (
        <Button variant="ghost" size="sm" className="w-full" onClick={onBack} disabled={busy}>
          Back to PIN
        </Button>
      )}
    </div>
  );
}
