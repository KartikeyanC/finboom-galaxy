import { useEffect, useState } from "react";

/**
 * BUG-096 — whether the browser thinks it has a network.
 *
 * There was no offline handling anywhere in `src/`, and the service worker
 * made that worse rather than better: the shell loads perfectly from cache, so
 * the app came up looking entirely normal and went on showing figures that
 * could be hours stale, with nothing on screen to say so. Silence is the wrong
 * answer for a money app — a balance you believe is current is worse than a
 * balance you know you cannot see.
 *
 * `navigator.onLine` is famously optimistic: `true` means "there is an
 * interface", not "the internet is reachable". That is fine here, because this
 * only drives a banner. It is deliberately NOT wired to anything that decides
 * whether a write is allowed — the write attempt itself is the honest test of
 * connectivity, and TanStack Query already retries.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    // Re-read on mount: the events only fire on a CHANGE, so a tab that was
    // opened while already offline would otherwise never learn about it.
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
