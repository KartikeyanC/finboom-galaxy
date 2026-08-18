import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  clearHidden,
  hiddenAt,
  isUnlocked,
  lockNow,
  markHidden,
  needsPassword,
  shouldLockOnReturn,
} from "@/lib/appLock";
import { useLockSettings } from "@/hooks/useLockSettings";
import { LockScreen } from "@/components/LockScreen";
import { PinSetup } from "@/components/PinSetup";
import { OnboardingWizard } from "@/components/onboarding-wizard/OnboardingWizard";
import { useOnboardingWizard } from "@/hooks/useOnboardingWizard";

export const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [unlocked, setUnlocked] = useState(false);
  const onboarding = useOnboardingWizard();

  // Read synchronously (see useLockSettings) so neither the "create PIN"
  // screen nor the dashboard flashes for a paint before an effect has run.
  const lock = useLockSettings(user?.id);

  // Re-read on any lock change, not just on sign-in: setting a PIN in Settings
  // marks this tab unlocked, and without this the gate would keep its stale
  // `false` and throw up the lock screen the instant the lock turned on.
  useEffect(() => {
    if (!user) return;
    setUnlocked(isUnlocked(user.id));
  }, [user, lock.active, lock.hasPin]);

  /**
   * Stage 5.4 — leaving the tab starts a clock rather than slamming the door.
   *
   * Before this, ANY visibility change locked instantly: glancing at another
   * tab for two seconds meant re-entering the PIN, which taught people to pick
   * a PIN they could type without thinking. Now hiding records the moment, and
   * returning locks only if the grace period has run out. "Immediately" (0)
   * still locks on the way out, so a task-switcher preview of the hidden tab
   * shows the lock screen and not the balances.
   */
  useEffect(() => {
    if (!user || !lock.active) return;
    const uid = user.id;
    const onVisibility = () => {
      if (document.hidden) {
        markHidden(uid);
        if (lock.grace <= 0) {
          lockNow(uid);
          setUnlocked(false);
        }
        return;
      }
      if (shouldLockOnReturn(hiddenAt(uid), Date.now(), lock.grace)) {
        lockNow(uid);
        setUnlocked(false);
      }
      clearHidden(uid);
    };
    const onLockRequest = () => {
      lockNow(uid);
      clearHidden(uid);
      setUnlocked(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("finroot:lock", onLockRequest);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("finroot:lock", onLockRequest);
    };
  }, [user, lock.active, lock.grace]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-foreground font-medium">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Stage 6.1 — a brand-new user answers a short selection-only profile
  // wizard before anything else. Checked (and its own loading state gated)
  // BEFORE the PinSetup/LockScreen gates below, so it never flashes the
  // dashboard for a beat while "has this account finished onboarding" is
  // still in flight — the same class of bug as BUG-090's sign-in flash.
  // `onboarding.completed` fails OPEN (defaults true) once loaded for real,
  // so a network hiccup after this can never trap an existing user here.
  if (onboarding.loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-foreground font-medium">Loading…</div>
      </div>
    );
  }
  if (!onboarding.completed) {
    return <OnboardingWizard />;
  }

  // Never asked, or asked for the lock without a PIN behind it yet (a new
  // account, or one that just reset a forgotten PIN). PinSetup can be declined.
  if (lock.choice === "unset" || (lock.choice === "on" && !lock.hasPin)) {
    return (
      <PinSetup
        mode={lock.choice === "unset" ? "offer" : "reset"}
        onDone={() => setUnlocked(true)}
      />
    );
  }

  if (lock.active && !unlocked) {
    return (
      <LockScreen
        mode={needsPassword(user.id) ? "password" : "pin"}
        onUnlocked={() => setUnlocked(true)}
      />
    );
  }

  return children;
};
