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
import { useAuth } from "@/hooks/useAuth";

export type TenantRole = "owner" | "admin" | "viewer";

export type TenantMembership = {
  tenantId: string;
  name: string;
  status: string;
  role: TenantRole;
  memberStatus: string;
};

type TenantContextValue = {
  memberships: TenantMembership[];
  currentTenantId: string | null;
  setCurrentTenantId: (id: string) => void;
  current: TenantMembership | null;
  role: TenantRole | null;
  loading: boolean;
  /** True when the last `tenant_members` fetch itself failed (BUG-115's
   * reopened half) — distinct from a real account with zero memberships.
   * Both leave `memberships` empty, but only this one means "we don't know",
   * not "we checked and there is nothing". */
  error: boolean;
  refresh: () => Promise<void>;
};

const STORAGE_CURRENT = "finroot.tenant.current";

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [currentTenantId, setCurrentIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_CURRENT) || null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const setCurrentTenantId = useCallback((id: string) => {
    setCurrentIdState(id);
    try {
      localStorage.setItem(STORAGE_CURRENT, id);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Explicitly scope to this user: the tenant_members RLS policy also allows
    // platform admins to read ALL rows, so we must filter by user_id ourselves
    // (otherwise a Product Owner would see every tenant's memberships).
    const { data, error: fetchError } = await supabase
      .from("tenant_members")
      .select("tenant_id, role, status, tenants(name, status)")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (fetchError) {
      setMemberships([]);
      setError(true);
      setLoading(false);
      return;
    }

    const list: TenantMembership[] = (data ?? []).map((row) => {
      const tenant = row.tenants as { name: string; status: string } | null;
      return {
        tenantId: row.tenant_id as string,
        name: tenant?.name ?? "Workspace",
        status: tenant?.status ?? "active",
        role: row.role as TenantRole,
        memberStatus: row.status as string,
      };
    });
    setMemberships(list);
    setError(false);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  // Keep currentTenantId valid: default to first membership; reset if stale.
  //
  // "Stale" must also cover a tenant that was soft-deleted out from under a
  // stored id — checking tenantId alone let a deleted workspace stay "valid"
  // forever (its tenant_members row is still status='active'; only the tenant
  // itself is 'deleted'), so every RLS write silently failed with a raw
  // Postgres 42501 and no indication why. Prefer a non-deleted membership,
  // both as the fallback and as what counts as still valid.
  useEffect(() => {
    if (loading) return;
    if (memberships.length === 0) {
      if (currentTenantId !== null) setCurrentIdState(null);
      return;
    }
    const stillValid =
      currentTenantId &&
      memberships.some((m) => m.tenantId === currentTenantId && m.status !== "deleted");
    if (!stillValid) {
      const fallback = memberships.find((m) => m.status !== "deleted") ?? memberships[0];
      setCurrentTenantId(fallback.tenantId);
    }
  }, [loading, memberships, currentTenantId, setCurrentTenantId]);

  const current = useMemo(
    () => memberships.find((m) => m.tenantId === currentTenantId) ?? null,
    [memberships, currentTenantId],
  );

  const value = useMemo<TenantContextValue>(
    () => ({
      memberships,
      currentTenantId,
      setCurrentTenantId,
      current,
      role: current?.role ?? null,
      loading,
      error,
      refresh: load,
    }),
    [memberships, currentTenantId, setCurrentTenantId, current, loading, error, load],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within a TenantProvider");
  return ctx;
}
