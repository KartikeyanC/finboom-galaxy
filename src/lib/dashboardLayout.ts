import { useSyncExternalStore } from "react";

/**
 * Dashboard layout switch — lets the user flip between the classic dashboard
 * and the new "Wealth" layout. The classic layout is kept (disabled mode),
 * never removed. Default is the new Wealth layout.
 */
export type DashboardLayout = "wealth" | "classic";

const STORAGE_KEY = "finroots.dashboard.layout";
const EVENT = "finroots:dashboard-layout";
const DEFAULT: DashboardLayout = "classic";

export function getDashboardLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "classic" || raw === "wealth" ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setDashboardLayout(layout: DashboardLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Reactive hook — re-renders when the layout preference changes. */
export function useDashboardLayout(): DashboardLayout {
  return useSyncExternalStore(subscribe, getDashboardLayout, () => DEFAULT);
}
