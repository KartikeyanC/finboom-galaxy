import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { notifyError } from "@/lib/errorMessages";
import type { OnboardingSelections } from "@/lib/onboardingWizard";

interface OnboardingRow {
  onboarding_completed: boolean;
  onboarding_step: number;
  onboarding_selections: OnboardingSelections;
}

/**
 * Fail OPEN, not closed: while loading or on any error, behave as "already
 * done" so a network hiccup can never trap an existing user behind a wizard
 * gate. The one-in-a-million cost is a genuinely new user occasionally
 * skipping straight to the dashboard — far cheaper than locking someone out
 * of their own data. Same reasoning as `isUnlocked()`'s BUG-092 fix.
 */
const FAIL_OPEN: OnboardingRow = {
  onboarding_completed: true,
  onboarding_step: 1,
  onboarding_selections: {},
};

/**
 * Stage 6.1 — read/write the current user's onboarding-wizard state, stored
 * directly on `profiles` (per-user, not the tenant-scoped `tenant_settings`
 * table the *different* Stage 5.3 checklist uses). Modeled on
 * `useTenantSetting.ts`'s `{ value, setValue, loading, saving }` shape.
 */
export function useOnboardingWizard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["onboarding-wizard", user?.id];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<OnboardingRow> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed, onboarding_step, onboarding_selections")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return FAIL_OPEN;
      return {
        onboarding_completed: data.onboarding_completed,
        onboarding_step: data.onboarding_step,
        onboarding_selections: (data.onboarding_selections as OnboardingSelections | null) ?? {},
      };
    },
  });

  const row = data ?? FAIL_OPEN;

  const save = useMutation({
    mutationFn: async (patch: Partial<OnboardingRow>) => {
      if (!user) throw new Error("Not signed in");
      const update: TablesUpdate<"profiles"> = {
        ...(patch.onboarding_completed !== undefined && { onboarding_completed: patch.onboarding_completed }),
        ...(patch.onboarding_step !== undefined && { onboarding_step: patch.onboarding_step }),
        // Our precise selections type is narrower than the DB's generic Json
        // column type; this cast is a normal serialization boundary, the same
        // idiom useIncomeStreams.ts uses at its insert sites — not a
        // types-not-generated-yet placeholder.
        ...(patch.onboarding_selections !== undefined && {
          onboarding_selections: patch.onboarding_selections as unknown as Json,
        }),
      };
      const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
      if (error) throw error;
      return patch;
    },
    onError: (err) => notifyError(err, { title: "Could not save your progress" }),
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  // Fires on every Continue/Skip, not just at the end — progress lives in
  // Postgres so a reload or a later sign-in resumes at the right step.
  const saveStep = useCallback(
    (step: number, partial: OnboardingSelections) => {
      save.mutate({
        onboarding_step: step,
        onboarding_selections: { ...row.onboarding_selections, ...partial },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row.onboarding_selections],
  );

  const complete = useCallback(
    (finalSelections: OnboardingSelections) => {
      save.mutate({
        onboarding_completed: true,
        onboarding_selections: { ...row.onboarding_selections, ...finalSelections },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row.onboarding_selections],
  );

  return {
    completed: row.onboarding_completed,
    step: row.onboarding_step,
    selections: row.onboarding_selections,
    loading: isLoading,
    saving: save.isPending,
    saveStep,
    complete,
  };
}
