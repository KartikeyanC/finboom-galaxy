import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Sprout, UserCircle2, X } from "lucide-react";

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

const friendlyAuthError = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "The email or password is incorrect. Please try again.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email address before signing in.";
  if (m.includes("user already registered") || m.includes("already registered"))
    return "An account with this email already exists. Try signing in instead.";
  if (m.includes("rate") && m.includes("limit"))
    return "Too many attempts. Please wait a moment and try again.";
  if (m.includes("network"))
    return "Network issue. Check your connection and retry.";
  return msg;
};

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "signup" ? "signup" : "signin";
  const { user, loading } = useAuth();
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
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: parsed.data.name },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyAuthError(error.message));
      return;
    }
    if (signupRemember) {
      saveProfile({ name: parsed.data.name, email: parsed.data.email });
      setProfiles(loadProfiles());
    }
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
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyAuthError(error.message));
      return;
    }
    // Saved profiles stay persistent; clear any legacy session-only flag.
    localStorage.removeItem("finroots.session_only");
    navigate(redirectTo, { replace: true });
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/app`,
    });
    if (result.error) {
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
      toast.error(friendlyAuthError(error.message));
      return;
    }
    toast.success("Password reset link sent. Check your inbox.");
    setResetOpen(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sprout className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">FinRoots</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
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
                    <Input id="signin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={!!activeProfile} />
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
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Re-enter password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
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
      </div>
    </div>
  );
};

export default AuthPage;