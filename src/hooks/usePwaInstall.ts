import { useEffect, useReducer } from "react";

/** Captured `beforeinstallprompt` event (not in standard lib types). */
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Module-level singleton so every consumer shares the one captured prompt event.
let deferred: BIPEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

if (typeof window !== "undefined") {
  installed =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function isIOSDevice() {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export interface PwaInstall {
  /** native install prompt is available (Android / desktop Chrome) */
  canPrompt: boolean;
  /** already running as an installed app */
  isStandalone: boolean;
  isIOS: boolean;
  /** trigger the native prompt; "unavailable" when no captured event (e.g. iOS) */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export function usePwaInstall(): PwaInstall {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    subs.add(force);
    return () => {
      subs.delete(force);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    deferred = null;
    emit();
    return choice.outcome;
  };

  return {
    canPrompt: !!deferred && !installed,
    isStandalone: installed,
    isIOS: isIOSDevice(),
    promptInstall,
  };
}
