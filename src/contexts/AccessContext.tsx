import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { ALL_MENU_IDS } from "@/lib/accessMenus";

export type AccessProfile = {
  id: string; // user_id
  name: string;
  role: "admin" | "viewer";
  menus: string[];
};

/** Raw member row from list_tenant_members RPC. */
export type TenantMemberInfo = {
  user_id: string;
  role: "owner" | "admin" | "viewer";
  status: string;
  menu_overrides: { allow?: string[]; deny?: string[] } | null;
  display_name: string | null;
  email: string | null;
  username: string | null;
};

type AccessContextValue = {
  profiles: AccessProfile[];
  /** Full member list (incl. owner) for the permissions center. */
  members: TenantMemberInfo[];
  /** Re-fetch members + effective menus from the server. */
  refresh: () => Promise<void>;
  viewAsId: string | null; // null => act as self
  setViewAsId: (id: string | null) => void;
  activeProfile: AccessProfile | null;
  /** null means "not resolved yet". Otherwise the allowed menu ids. */
  allowedMenus: string[] | null;
  /** True until the server has answered (or failed) for the current tenant. */
  accessLoading: boolean;
  /**
   * True when permissions could not be *resolved* (a failed RPC, or the
   * tenant list itself failing to load) — distinct from resolving cleanly to
   * "no access". `allowedMenus` fails closed to `[]` in both cases, on
   * purpose (BUG-090's lesson: an unresolved check must never read as full
   * access), but a redirect-away-and-say-nothing response to this one reads
   * as data loss to whoever is looking at it (BUG-115). Callers that decide
   * whether to redirect vs. show a "try again" state should check this
   * instead of inferring it from an empty `allowedMenus`.
   */
  menusErrored: boolean;
  canAccess: (menuId: string | undefined) => boolean;
  canWrite: (menuId: string | undefined) => boolean;
  isReadOnly: boolean;
};

const STORAGE_VIEW_AS = "finroot.access.viewAs";

const AccessContext = createContext<AccessContextValue | null>(null);

/** Menus always accessible regardless of permissions (account/billing/settings). */
const ALWAYS_ALLOWED = new Set([
  "accounts",
  "settings",
  "profile",
  "notifications",
]);

function memberToProfile(m: TenantMemberInfo): AccessProfile {
  return {
    id: m.user_id,
    name: m.display_name || m.email || m.username || "Collaborator",
    role: m.role === "owner" ? "admin" : m.role,
    menus: m.menu_overrides?.allow ?? ALL_MENU_IDS,
  };
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const { currentTenantId, role, loading: tenantLoading, error: tenantError } = useTenant();
  const [members, setMembers] = useState<TenantMemberInfo[]>([]);
  // null = not resolved yet; array = the server's answer, always enforced.
  const [effectiveMenus, setEffectiveMenus] = useState<string[] | null>(null);
  // "loading" is the only state that grants provisional access (purely to avoid
  // a menu flash on first paint). "error" must deny — a failing permissions RPC
  // previously left effectiveMenus at null forever, which read as full access.
  const [menusStatus, setMenusStatus] = useState<"loading" | "ready" | "error">("loading");
  // Separate from menusStatus === "error": that state also covers "no tenant
  // to check against", a legitimate answer, not a failure. This is true only
  // when resolution itself couldn't complete — a downed DB, a thrown fetch —
  // which is the case MenuGuard must show differently (BUG-115, reopened).
  const [rpcErrored, setRpcErrored] = useState(false);
  const [viewAsId, setViewAsIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_VIEW_AS) || null;
    } catch {
      return null;
    }
  });

  const setViewAsId = useCallback((id: string | null) => {
    setViewAsIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_VIEW_AS, id);
      else localStorage.removeItem(STORAGE_VIEW_AS);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    // No tenant once tenant resolution has finished means no grants at all —
    // unless TenantContext itself failed to resolve the tenant list, in which
    // case "no tenant" isn't a real answer, it's the same failure surfacing
    // one layer up (see TenantContext's own `error`).
    if (!currentTenantId) {
      setMembers([]);
      setEffectiveMenus([]);
      setMenusStatus("error");
      setRpcErrored(tenantError);
      return;
    }

    let menusRes, membersRes;
    try {
      [menusRes, membersRes] = await Promise.all([
        supabase.rpc("get_effective_menus", { p_tenant_id: currentTenantId }),
        supabase.rpc("list_tenant_members", { p_tenant_id: currentTenantId }),
      ]);
    } catch (e) {
      // Network/transport failure — deny rather than fall through to open.
      console.error("Failed to resolve access menus:", e);
      setEffectiveMenus([]);
      setMenusStatus("error");
      setRpcErrored(true);
      return;
    }

    if (!menusRes.error && Array.isArray(menusRes.data)) {
      setEffectiveMenus(menusRes.data as string[]);
      setMenusStatus("ready");
      setRpcErrored(false);
    } else {
      console.error("get_effective_menus failed:", menusRes.error);
      setEffectiveMenus([]);
      setMenusStatus("error");
      setRpcErrored(true);
    }

    if (!membersRes.error && Array.isArray(membersRes.data)) {
      setMembers(membersRes.data as TenantMemberInfo[]);
    }
  }, [currentTenantId, tenantError]);

  useEffect(() => {
    if (tenantLoading) return;
    void refresh();
  }, [tenantLoading, refresh]);

  // Re-entering the loading state when the tenant changes keeps the switch from
  // briefly showing the previous tenant's menus.
  useEffect(() => {
    setMenusStatus("loading");
  }, [currentTenantId]);

  // Collaborators (non-owner) for the "view as" dropdown.
  const profiles = useMemo(
    () => members.filter((m) => m.role !== "owner").map(memberToProfile),
    [members],
  );

  // Drop a stale preview selection.
  useEffect(() => {
    if (viewAsId && !profiles.some((p) => p.id === viewAsId)) {
      setViewAsId(null);
    }
  }, [profiles, viewAsId, setViewAsId]);

  const activeProfile = useMemo(
    () => (viewAsId ? profiles.find((p) => p.id === viewAsId) ?? null : null),
    [profiles, viewAsId],
  );

  // Effective allowed menus: preview overrides win; otherwise use the server's
  // plan⊕tenant⊕member result (applies to owners too — the plan gates features).
  // null effectiveMenus = still loading => full access (no flash).
  const allowedMenus = useMemo<string[] | null>(() => {
    if (activeProfile) return activeProfile.menus;
    return effectiveMenus;
  }, [activeProfile, effectiveMenus]);

  const accessLoading = !activeProfile && menusStatus === "loading";

  const canAccess = useCallback(
    (menuId: string | undefined) => {
      if (!menuId) return true;
      if (ALWAYS_ALLOWED.has(menuId)) return true;
      // Provisional access only while the first answer is in flight, so the
      // sidebar doesn't flash empty. Any other state consults the real list.
      if (accessLoading) return true;
      if (!allowedMenus) return false; // fail closed
      return allowedMenus.includes(menuId);
    },
    [allowedMenus, accessLoading],
  );

  const effectiveRole = activeProfile ? activeProfile.role : role;
  const isReadOnly = effectiveRole === "viewer";

  const canWrite = useCallback(
    (menuId: string | undefined) => {
      if (effectiveRole === "viewer") return false;
      if (!activeProfile && role === "owner") return true;
      return canAccess(menuId);
    },
    [effectiveRole, activeProfile, role, canAccess],
  );

  const value = useMemo<AccessContextValue>(
    () => ({
      profiles,
      members,
      refresh,
      viewAsId,
      setViewAsId,
      activeProfile,
      allowedMenus,
      accessLoading,
      menusErrored: rpcErrored,
      canAccess,
      canWrite,
      isReadOnly,
    }),
    [profiles, members, refresh, viewAsId, setViewAsId, activeProfile, allowedMenus, accessLoading, rpcErrored, canAccess, canWrite, isReadOnly],
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
