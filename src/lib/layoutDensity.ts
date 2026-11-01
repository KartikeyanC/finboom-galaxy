import { useEffect, useSyncExternalStore } from "react";

/**
 * Layout density — "comfortable" (the default spacing) or "compact" (tighter
 * cards and gaps, so more fits on a laptop screen).
 *
 * Device-local, like the dashboard layout: a phone and a 13" laptop want
 * different answers, and the choice is about this screen, not the workspace.
 * It is applied as `data-density` on <html>; `index.css` does the rest, so no
 * page has to know about it. Text sizes never change — only spacing.
 */
export type LayoutDensity = "comfortable" | "compact";

const STORAGE_KEY = "finroot.layout.density";
const EVENT = "finroot:layout-density";
const DEFAULT: LayoutDensity = "comfortable";

export function parseDensity(raw: string | null): LayoutDensity {
  return raw === "compact" ? "compact" : DEFAULT;
}

export function getLayoutDensity(): LayoutDensity {
  try {
    return parseDensity(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT;
  }
}

export function setLayoutDensity(density: LayoutDensity) {
  try {
    localStorage.setItem(STORAGE_KEY, density);
  } catch {
    /* storage blocked — still applies for this visit via the event below */
  }
  applyDensity(density);
  window.dispatchEvent(new Event(EVENT));
}

export function applyDensity(density: LayoutDensity) {
  document.documentElement.dataset.density = density;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Reactive read of the current density. */
export function useLayoutDensity(): LayoutDensity {
  return useSyncExternalStore(subscribe, getLayoutDensity, () => DEFAULT);
}

/** Rendered once at the app root: keeps <html data-density> in step. */
export function LayoutDensityRoot() {
  const density = useLayoutDensity();
  useEffect(() => applyDensity(density), [density]);
  return null;
}
