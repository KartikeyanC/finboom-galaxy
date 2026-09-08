import { useEffect } from "react";
import { motionDebugEnabled, ALL_ENTRIES } from "@/animations";

/**
 * Dev-only. Mount once near the app root; does nothing at all unless the URL
 * carries `?motionDebug=true`, at which point it:
 *
 *   - outlines every element that carries a motion hook we can see from the
 *     DOM (`[data-motion]`, `[data-cursor]`, framer's `[style*="transform"]`
 *     under a reveal) with a faint dashed ring;
 *   - prints the animation registry to the console once.
 *
 * `logMotion(name, detail)` calls scattered through the motion components do
 * the per-trigger logging; this component is the always-on overview.
 */
export function MotionDebug() {
  useEffect(() => {
    if (!motionDebugEnabled()) return;

    console.groupCollapsed("%c[motion] registry", "color:#19B886;font-weight:600");
    console.table(ALL_ENTRIES);
    console.groupEnd();

    const style = document.createElement("style");
    style.dataset.motionDebug = "true";
    style.textContent = `
      [data-motion], [data-cursor],
      .fr-shimmer,
      [class*="marquee"] {
        outline: 1px dashed rgba(25,184,134,0.55) !important;
        outline-offset: 2px;
      }
      body::after {
        content: "motion-debug";
        position: fixed; left: 8px; bottom: 8px; z-index: 99999;
        font: 600 10px/1 ui-monospace, monospace; letter-spacing: .12em;
        color: #04130d; background: #19B886; padding: 4px 7px; border-radius: 3px;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return null;
}

export default MotionDebug;
