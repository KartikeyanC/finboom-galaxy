import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SkipLink } from "@/components/SkipLink";
import { useBranding } from "@/hooks/useBranding";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { recordLegalAcceptance } from "@/lib/legalAcceptance";
import { clearSignInIntent, markSignInIntent } from "@/lib/appLock";
import { UserCircle2, X } from "lucide-react";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80),
    email: z.string().email("Enter a valid email").max(255),
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type SavedProfile = { name: string; email: string };
const PROFILES_KEY = "valar.profiles";

const loadProfiles = (): SavedProfile[] => {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((p) => p?.email) : [];
  } catch {
    return [];
  }
};
const saveProfile = (p: SavedProfile) => {
  const list = loadProfiles().filter((x) => x.email.toLowerCase() !== p.email.toLowerCase());
  list.unshift(p);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list.slice(0, 8)));
};
const removeProfile = (email: string) => {
  const list = loadProfiles().filter((x) => x.email.toLowerCase() !== email.toLowerCase());
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
};


const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "signup" ? "signup" : "signin";
  const { user, loading } = useAuth();
  const { appName } = useBranding();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  // Sign-up fields
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupRemember, setSignupRemember] = useState(true);
  // Saved profiles for quick sign-in
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<SavedProfile | null>(null);

  useEffect(() => {
    setProfiles(loadProfiles());
  }, []);

  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/app";

  useEffect(() => {
    if (!loading && user) navigate(redirectTo, { replace: true });
  }, [user, loading, navigate, redirectTo]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse({
      name: signupName,
      email: signupEmail,
      password: signupPassword,
      confirmPassword: signupConfirm,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    // BUG-090: claim the unlock before the call, not after the event — see
    // `markSignInIntent`. Sign-up with confirmation off signs you straight in.
    markSignInIntent();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: parsed.data.name },
      },
    });
    setBusy(false);
    if (error) {
      clearSignInIntent();
      notifyError(error);
      return;
    }
    // BUG-098 — GoTrue's own anti-enumeration design returns `error: null`
    // for an already-registered, already-confirmed email too (a fabricated
    // user object with no identities, no new row, no email actually sent),
    // so this used to claim "Account created" for a signup that did nothing.
    // A neutral message that's true either way, without itself disclosing
    // which case happened, is the fix — not an error toast naming the email
    // as taken, which would just be a different enumeration leak.
    if (data.user && data.user.identities?.length === 0) {
      clearSignInIntent();
      toast.success("If that's a new email, check your inbox to confirm it. Already have an account? Sign in instead.");
      return;
    }
    if (signupRemember) {
      saveProfile({ name: parsed.data.name, email: parsed.data.email });
      setProfiles(loadProfiles());
    }
    recordLegalAcceptance();
    toast.success("Account created. Check your email to confirm.");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveEmail = activeProfile?.email ?? email;
    const parsed = credentialsSchema.safeParse({ email: effectiveEmail, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    markSignInIntent(); // BUG-090 — see `markSignInIntent`
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setBusy(false);
    if (error) {
      clearSignInIntent();
      notifyError(error);
      return;
    }
    // Remember this profile so it shows under "Saved profiles" next time.
    saveProfile({
      name: activeProfile?.name || parsed.data.email.split("@")[0],
      email: parsed.data.email,
    });
    navigate(redirectTo, { replace: true });
  };

  const handleGoogle = async () => {
    setBusy(true);
    // The marker is in sessionStorage, so it survives the round trip to Google
    // and back into this same tab — which is the whole journey it has to cover.
    markSignInIntent();
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/app`,
    });
    if (result.error) {
      clearSignInIntent();
      setBusy(false);
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate(redirectTo, { replace: true });
  };

  const handlePasswordReset = async () => {
    const parsed = z.string().email().safeParse(resetEmail);
    if (!parsed.success) {
      toast.error("Enter a valid email to receive a reset link.");
      return;
    }
    setResetBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetBusy(false);
    if (error) {
      notifyError(error);
      return;
    }
    toast.success("Password reset link sent. Check your inbox.");
    setResetOpen(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* BUG-093 — this page had no landmark and no skip link at all. It is the
          first authenticated page anyone meets, and a screen reader had nothing
          to orient on: no <main>, so every control was "outside any region". */}
      <SkipLink target="auth-main" />
      <main id="auth-main" tabIndex={-1} className="w-full max-w-md">
        <Link
          to="/"
          aria-label={`Back to ${appName} home`}
          className="mb-2 flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
        >
          <BrandLogo className="h-10 w-10 rounded-[2px]" />
          {/* BUG-097 — this was an <h1> nested in a link, so the page's only
              level-1 heading was "FinRoot" and the real heading below it
              (<h3> "Welcome") jumped two levels. The brand is a link home, not
              the document's title. */}
          <span className="text-2xl font-semibold tracking-tight">{appName}</span>
        </Link>
        {/* BUG-094 — this was `text-[#1E293B]`, a hardcoded near-black tagline
            sitting on a near-black background: 1.36:1, invisible in the default
            theme and only ever legible in `light`. A themed token cannot make
            that mistake. */}
        <p className="mb-6 text-center text-sm font-semibold tracking-tight text-muted-foreground">
          One App. Zero Friction. Your Complete Wealth Workspace.
        </p>

        <Card>
          <CardHeader>
            {/* BUG-097 — the page's real title, so it is also its <h1>. */}
            <CardTitle as="h1">Welcome</CardTitle>
            <CardDescription>Sign in or create an account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={initialTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                  {profiles.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Saved profiles
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {profiles.map((p) => {
                          const isActive = activeProfile?.email === p.email;
                          return (
                            <button
                              key={p.email}
                              type="button"
                              onClick={() => {
                                setActiveProfile(p);
                                setEmail(p.email);
                              }}
                              className={`group relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                                isActive
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border hover:bg-accent"
                              }`}
                            >
                              <UserCircle2 className="h-4 w-4" />
                              <span className="max-w-[140px] truncate">{p.name || p.email}</span>
                              <span
                                role="button"
                                aria-label={`Remove ${p.email}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  removeProfile(p.email);
                                  const next = loadProfiles();
                                  setProfiles(next);
                                  if (isActive) {
                                    setActiveProfile(null);
                                    setEmail("");
                                  }
                                }}
                                className="ml-1 rounded-full p-0.5 opacity-60 hover:bg-background hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeProfile ? (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      Signing in as{" "}
                      <span className="font-medium text-foreground">{activeProfile.name || activeProfile.email}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveProfile(null);
                          setEmail("");
                        }}
                        className="ml-2 text-xs text-primary hover:underline"
                      >
                        Use a different account
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <PasswordInput id="signin-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={!!activeProfile} />
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(activeProfile?.email ?? email);
                        setResetOpen(true);
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      autoComplete="name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <PasswordInput
                      id="signup-password"
                      autoComplete="new-password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Re-enter password</Label>
                    <PasswordInput
                      id="signup-confirm"
                      autoComplete="new-password"
                      value={signupConfirm}
                      onChange={(e) => setSignupConfirm(e.target.value)}
                      required
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                    <Checkbox
                      checked={signupRemember}
                      onCheckedChange={(v) => setSignupRemember(v === true)}
                    />
                    Remember this profile on this device
                  </label>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Creating account…" : "Create account"}
                  </Button>
                  {/*
                    Stage 5.1 — notice at the point of consent, not buried in a
                    footer. It sits BELOW the button on purpose: it describes
                    what pressing the button means, and both documents open in a
                    new tab so a half-filled form is never lost.
                  */}
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    By creating an account you agree to our{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                    >
                      Privacy Policy
                    </a>
                    .
                  </p>
                </form>
              </TabsContent>
            </Tabs>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
              Continue with Google
            </Button>
          </CardContent>
        </Card>

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset your password</DialogTitle>
              <DialogDescription>
                Enter your email and we'll send you a secure link to set a new password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetBusy}>
                Cancel
              </Button>
              <Button onClick={handlePasswordReset} disabled={resetBusy}>
                {resetBusy ? "Sending…" : "Send reset link"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default AuthPage;