import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AccessProfile = {
  id: string;
  name: string;
  role: "admin" | "viewer";
  menus: string[];
};

type AccessContextValue = {
  profiles: AccessProfile[];
  setProfiles: (p: AccessProfile[]) => void;
  viewAsId: string | null; // null => owner / full access
  setViewAsId: (id: string | null) => void;
  activeProfile: AccessProfile | null;
  /** null means full access (owner). Otherwise list of allowed menu ids. */
  allowedMenus: string[] | null;
  canAccess: (menuId: string | undefined) => boolean;
  /** Whether the active profile can mutate the given module. */
  canWrite: (menuId: string | undefined) => boolean;
  /** True when a restricted (viewer) profile is currently active. */
  isReadOnly: boolean;
};

const STORAGE_PROFILES = "finroots.access.profiles";
const STORAGE_VIEW_AS = "finroots.access.viewAs";

const AccessContext = createContext<AccessContextValue | null>(null);

/**
 * Menus that are always accessible regardless of collaborator permissions
 * (operational areas needed to manage account / billing / personal settings).
 */
const ALWAYS_ALLOWED = new Set([
  "accounts",
  "settings",
  "billing",
  "profile",
  "notifications",
]);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfilesState] = useState<AccessProfile[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PROFILES);
      return raw ? (JSON.parse(raw) as AccessProfile[]) : [];
    } catch {
      return [];
    }
  });
  const [viewAsId, setViewAsIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_VIEW_AS) || null;
    } catch {
      return null;
    }
  });

  const setProfiles = useCallback((p: AccessProfile[]) => {
    setProfilesState(p);
    try {
      localStorage.setItem(STORAGE_PROFILES, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const setViewAsId = useCallback((id: string | null) => {
    setViewAsIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_VIEW_AS, id);
      else localStorage.removeItem(STORAGE_VIEW_AS);
    } catch {
      /* ignore */
    }
  }, []);

  // If the selected profile gets removed, fall back to owner.
  useEffect(() => {
    if (viewAsId && !profiles.some((p) => p.id === viewAsId)) {
      setViewAsId(null);
    }
  }, [profiles, viewAsId, setViewAsId]);

  const activeProfile = useMemo(
    () => (viewAsId ? profiles.find((p) => p.id === viewAsId) ?? null : null),
    [profiles, viewAsId],
  );

  const allowedMenus = activeProfile ? activeProfile.menus : null;

  const canAccess = useCallback(
    (menuId: string | undefined) => {
      if (!menuId) return true;
      if (ALWAYS_ALLOWED.has(menuId)) return true;
      if (!allowedMenus) return true; // owner
      return allowedMenus.includes(menuId);
    },
    [allowedMenus],
  );

  const isReadOnly = !!activeProfile && activeProfile.role === "viewer";

  const canWrite = useCallback(
    (menuId: string | undefined) => {
      if (!activeProfile) return true; // owner
      if (activeProfile.role === "viewer") return false;
      // admin profile: can write only on modules they have access to
      return canAccess(menuId);
    },
    [activeProfile, canAccess],
  );

  const value = useMemo<AccessContextValue>(
    () => ({
      profiles,
      setProfiles,
      viewAsId,
      setViewAsId,
      activeProfile,
      allowedMenus,
      canAccess,
      canWrite,
      isReadOnly,
    }),
    [profiles, setProfiles, viewAsId, setViewAsId, activeProfile, allowedMenus, canAccess, canWrite, isReadOnly],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within an AccessProvider");
  return ctx;
}

/**
 * Default landing menu when the viewer can't access the requested route.
 * Dashboard if allowed, otherwise the first menu they can see, otherwise Accounts.
 */
export function fallbackPath(allowedMenus: string[] | null): string {
  if (!allowedMenus) return "/app";
  if (allowedMenus.includes("dashboard")) return "/app";
  const map: Record<string, string> = {
    income: "/app/income",
    expenses: "/app/expenses",
    investments: "/app/investments",
    budget: "/app/budget",
    goals: "/app/goals",
    reminders: "/app/reminders",
    calculator: "/app/calculator",
    import: "/app/import",
    "bill-scan": "/app/bill-scan",
  };
  for (const m of allowedMenus) {
    if (map[m]) return map[m];
  }
  return "/app/accounts";
}