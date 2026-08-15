import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_KEY,
  normalizeStatusNotice,
  stateForLatency,
  type ServiceCheck,
  type StatusNotice,
} from "@/lib/status";

/**
 * Stage 5.7 — the live probes behind `/status`.
 *
 * They run **in the visitor's browser**, on purpose. A server-side monitor
 * proves the service is up somewhere; this proves it is reachable from where
 * the person actually is, which is the thing they cannot otherwise find out.
 * The page says so, because the difference matters when the answer is "your
 * network".
 *
 * Only endpoints that work **unauthenticated** are probed. A check that fails
 * for a signed-out visitor would paint the page red for everyone reading it
 * during an incident, which is precisely the wrong moment to be wrong.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Long enough for a slow phone on mobile data, short enough to feel alive. */
const TIMEOUT_MS = 8000;

type Probe = { id: string; label: string; description: string; run: (signal: AbortSignal) => Promise<void> };

const PROBES: Probe[] = [
  {
    id: "api",
    label: "Database & API",
    description: "Reading your data — transactions, budgets, everything.",
    run: async (signal) => {
      // The plan catalogue is public read-only data, so this needs no session
      // and touches nobody's finances.
      const res = await fetch(`${URL}/rest/v1/plans?select=id&limit=1`, {
        headers: { apikey: KEY ?? "", accept: "application/json" },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    id: "auth",
    label: "Sign-in",
    description: "Signing in, signing up and password resets.",
    run: async (signal) => {
      const res = await fetch(`${URL}/auth/v1/health`, {
        headers: { apikey: KEY ?? "" },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
];

/**
 * The web app itself is not probed — you are reading this page, so it loaded.
 * Saying that plainly is more honest than a check that can only ever be green.
 */
export const APP_CHECK: ServiceCheck = {
  id: "app",
  label: "Web app",
  description: "This page reached you, so the app and its hosting are serving.",
  state: "operational",
};

export function useServiceChecks() {
  const [checks, setChecks] = useState<ServiceCheck[]>(() => [
    ...PROBES.map((p) => ({ id: p.id, label: p.label, description: p.description, state: "checking" as const })),
    APP_CHECK,
  ]);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    setChecks((prev) => prev.map((c) => (c.id === "app" ? c : { ...c, state: "checking" as const })));

    const results = await Promise.all(
      PROBES.map(async (p): Promise<ServiceCheck> => {
        const started = performance.now();
        try {
          if (!URL || !KEY) throw new Error("not configured");
          await p.run(controller.signal);
          const ms = Math.round(performance.now() - started);
          return { id: p.id, label: p.label, description: p.description, state: stateForLatency(ms), ms };
        } catch (e) {
          const aborted = (e as Error)?.name === "AbortError";
          return {
            id: p.id,
            label: p.label,
            description: p.description,
            state: "down",
            error: aborted ? `no response in ${TIMEOUT_MS / 1000}s` : (e as Error)?.message || "unreachable",
          };
        }
      }),
    );

    clearTimeout(timer);
    if (controller.signal.aborted && !results.some((r) => r.state === "down")) return;
    setChecks([...results, APP_CHECK]);
    setRanAt(new Date());
  }, []);

  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  return { checks, ranAt, refresh: run };
}

/** The operator's notice. Public read — `landing_*` keys are anon-readable. */
export function useStatusNotice(): { notice: StatusNotice; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["status-notice"],
    staleTime: 30_000,
    queryFn: async (): Promise<StatusNotice> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", STATUS_KEY)
        .maybeSingle();
      if (error || !data) return normalizeStatusNotice(null);
      return normalizeStatusNotice(data.value);
    },
  });
  return { notice: normalizeStatusNotice(data ?? null), loading: isLoading };
}
