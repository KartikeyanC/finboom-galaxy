import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";
import type { Json } from "@/integrations/supabase/types";
import {
  TENANT_SETTINGS,
  importedFlagKey,
  type TenantSettingKey,
  type TenantSettingsMap,
} from "@/lib/tenantSettings";

/**
 * Stage 3.1 — read/write one workspace setting, with a one-time import of
 * whatever the browser still holds under the old localStorage key.
 *
 * Deliberately keeps the shape of the localStorage stores it replaces
 * (`{ value, setValue }` + synchronous-feeling reads) so call sites change as
 * little as possible — the same approach that let the Phase-2 store migrations
 * land without touching a single page.
 */
export function useTenantSetting<K extends TenantSettingKey>(key: K) {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const { defaultValue } = TENANT_SETTINGS[key];
  const queryKey = ["tenant-setting", key, currentTenantId];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<TenantSettingsMap[K]> => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("value")
        .eq("tenant_id", currentTenantId as string)
        .eq("key", key)
        .maybeSingle();
      // A missing row is the normal state for a workspace that never set this,
      // not a failure — maybeSingle gives null rather than throwing.
      if (error) throw error;
      if (!data) return defaultValue;
      return data.value as unknown as TenantSettingsMap[K];
    },
  });

  const save = useMutation({
    mutationFn: async (next: TenantSettingsMap[K]) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase.from("tenant_settings").upsert(
        {
          tenant_id: currentTenantId,
          key,
          value: next as unknown as Json,
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        },
        { onConflict: "tenant_id,key" },
      );
      if (error) throw error;
      return next;
    },
    // Optimistic: these are UI preferences and a round-trip per keystroke on a
    // slider would feel broken. The server still wins on error.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<TenantSettingsMap[K]>(queryKey);
      qc.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (err, _next, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(queryKey, ctx.previous);
      notifyError(err, { title: "Could not save your settings" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  // ---- one-time localStorage -> DB import --------------------------------
  // Guarded per (setting, tenant): importing this device's values into a second
  // workspace would copy one workspace's categories into another. Runs only
  // when the server genuinely has no row, so it can never clobber a saved value.
  const importAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (!currentTenantId || isLoading) return;
    // Settings written after Stage 3.1 have no localStorage predecessor, so
    // there is nothing to import and no flag worth writing.
    const legacyKey = TENANT_SETTINGS[key].legacyKey;
    if (!legacyKey) return;
    const flag = importedFlagKey(key, currentTenantId);
    if (importAttempted.current === flag) return;

    let legacy: unknown;
    try {
      if (localStorage.getItem(flag)) return;
      const raw = localStorage.getItem(legacyKey);
      if (!raw) return;
      legacy = JSON.parse(raw);
    } catch {
      return; // unparseable leftovers are not worth surfacing
    }
    if (legacy === null || legacy === undefined) return;

    // Only import into an empty setting.
    supabase
      .from("tenant_settings")
      .select("key")
      .eq("tenant_id", currentTenantId)
      .eq("key", key)
      .maybeSingle()
      .then(({ data: existing }) => {
        if (existing) {
          try {
            localStorage.setItem(flag, "1");
          } catch {
            /* private mode */
          }
          return;
        }
        importAttempted.current = flag;
        save.mutate(legacy as TenantSettingsMap[K], {
          onSuccess: () => {
            try {
              localStorage.setItem(flag, "1");
            } catch {
              /* private mode */
            }
          },
        });
      });
    // save.mutate is stable; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenantId, isLoading, key]);

  const setValue = useCallback(
    (next: TenantSettingsMap[K]) => save.mutate(next),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentTenantId, key],
  );

  return {
    value: (data ?? defaultValue) as TenantSettingsMap[K],
    setValue,
    loading: isLoading,
    saving: save.isPending,
  };
}
