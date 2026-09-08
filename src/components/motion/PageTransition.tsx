import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { duration, ease, distance } from "@/animations";
import { logMotion } from "@/animations";

/**
 * A gentle mount entrance for a top-level public page (Landing, Auth, the
 * legal / support / status pages). The router swaps the element on a route
 * change, so each page mounts fresh and plays this once — no `AnimatePresence`,
 * no exit choreography, which is deliberate:
 *
 *   - the public pages are lazy-loaded behind one <Suspense>; a `mode="wait"`
 *     exit would have to finish *before* the next chunk starts fetching, which
 *     reads as a stall on a slow connection;
 *   - it must never delay content or interfere with the back button — an
 *     entrance-only fade can do neither.
 *
 * The signed-in shells (`/app/*`, `/po/*`) are intentionally *not* wrapped:
 * they keep a persistent layout and re-mounting them on every in-app
 * navigation would drop scroll position and refetch data.
 *
 * A true cross-page crossfade would need the `<Routes location key>` +
 * `<AnimatePresence>` refactor in App.tsx — noted in docs/motion-system.md as
 * deferred.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;

  logMotion("pageTransition");

  return (
    <motion.div
      initial={{ opacity: 0, y: distance.xs }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: ease.standard }}
    >
      {children}
    </motion.div>
  );
}

export default PageTransition;
