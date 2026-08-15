import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";
import { DEFAULT_REMINDER, type ReminderSetting } from "@/lib/recurringReminders";

const LEGACY_KEY = "finroot.recurring.reminders.v1";
// `finroot.` (singular) to match every other store's flag. `appLock.ts` runs a
// one-time rename of any `finroots.*` key to `finroot.*`, so the plural form
// would sit in a namespace another routine actively rewrites.
const importedFlag = (tenantId: string) => `finroot.migrated.recurringreminders.${tenantId}`;

/**
 * Stage 3.1 — per-recurring-item reminder settings, keyed by
 * `recurring_item_id` and scoped to the workspace.
 *
 * Returns the same `Record<itemId, ReminderSetting>` map the old localStorage
 * hook did, so the bells in RecurringList and the counters in WorkspaceManage
 * read exactly as before.
 */
export function useRecurringReminders() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["recurring-reminders", currentTenantId];

  const { data: rows, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_reminders")
        .select("recurring_item_id, enabled, days_before, note")
        .eq("tenant_id", currentTenantId as string);
      if (error) throw error;
      return data ?? [];
    },
  });

  const settings = useMemo(() => {
    const map: Record<string, ReminderSetting> = {};
    for (const r of rows ?? []) {
      map[r.recurring_item_id] = {
        enabled: r.enabled,
        days_before: r.days_before,
        note: r.note ?? "",
      };
    }
    return map;
  }, [rows]);

  const saveMutation = useMutation({
    mutationFn: async ({ itemId, setting }: { itemId: string; setting: ReminderSetting }) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase.from("recurring_reminders").upsert(
        {
          tenant_id: currentTenantId,
          recurring_item_id: itemId,
          enabled: setting.enabled,
          days_before: setting.days_before,
          note: setting.note || null,
        },
        // Plain unique constraint, so PostgREST can name it (2.7's lesson:
        // a partial index cannot be an on_conflict target).
        { onConflict: "tenant_id,recurring_item_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (err) => notifyError(err, { title: "Could not save the reminder" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase
        .from("recurring_reminders")
        .delete()
        .eq("tenant_id", currentTenantId)
        .eq("recurring_item_id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (err) => notifyError(err, { title: "Could not remove the reminder" }),
  });

  const save = useCallback(
    (itemId: string, setting: ReminderSetting) => saveMutation.mutate({ itemId, setting }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentTenantId],
  );

  const remove = useCallback(
    (itemId: string) => removeMutation.mutate(itemId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentTenantId],
  );

  // ---- one-time localStorage -> DB import --------------------------------
  // Only for items that still exist: the old map accumulated entries for
  // deleted recurring items, and the FK would reject those anyway.
  const importRan = useRef<string | null>(null);
  useEffect(() => {
    if (!currentTenantId || isLoading) return;
    const flag = importedFlag(currentTenantId);
    if (importRan.current === flag) return;
    importRan.current = flag;

    let legacy: Record<string, ReminderSetting>;
    try {
      if (localStorage.getItem(flag)) return;
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      legacy = JSON.parse(raw);
    } catch {
      return;
    }
    const entries = Object.entries(legacy ?? {});
    if (entries.length === 0) return;

    (async () => {
      const { data: items } = await supabase
        .from("recurring_items")
        .select("id")
        .eq("tenant_id", currentTenantId);
      const live = new Set((items ?? []).map((i) => i.id));

      const payload = entries
        .filter(([itemId]) => live.has(itemId))
        .map(([itemId, s]) => ({
          tenant_id: currentTenantId,
          recurring_item_id: itemId,
          enabled: !!s?.enabled,
          days_before: Number(s?.days_before) || DEFAULT_REMINDER.days_before,
          note: s?.note || null,
        }));

      if (payload.length > 0) {
        const { error } = await supabase
          .from("recurring_reminders")
          // Never overwrite a setting already on the server.
          .upsert(payload, { onConflict: "tenant_id,recurring_item_id", ignoreDuplicates: true });
        if (error) return; // leave the flag unset so it can retry next mount
        qc.invalidateQueries({ queryKey });
      }
      try {
        localStorage.setItem(flag, "1");
      } catch {
        /* private mode */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenantId, isLoading]);

  return { settings, save, remove, loading: isLoading };
}
