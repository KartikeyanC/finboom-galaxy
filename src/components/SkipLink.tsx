import { cn } from "@/lib/utils";

/**
 * "Skip to main content" — one definition, because four pages need it and
 * copy-paste is how two of them went without (BUG-093).
 *
 * Stage 4.8 added this markup to `Landing` and `DashboardLayout` by hand. The
 * pages written afterwards — `Auth` and `PublicLayout` — did not get it, and
 * nothing failed, because a missing skip link is invisible to everyone who is
 * not tabbing. Extracting it means the next page that needs one imports it
 * rather than remembering nine focus: utilities in the right order.
 *
 * Visually hidden until focused, which is the whole point: it appears exactly
 * when somebody is tabbing and is out of everyone else's way otherwise.
 *
 * `target` must be the id of an element that can actually take focus —
 * `tabIndex={-1}` on the `<main>` it points at. Without that the browser
 * scrolls but leaves focus where it was, and the next Tab carries on from the
 * navigation the user just asked to skip.
 */
export function SkipLink({
  target = "main-content",
  className,
}: {
  target?: string;
  className?: string;
}) {
  return (
    <a
      href={`#${target}`}
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]",
        "focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm",
        "focus:font-semibold focus:text-primary-foreground focus:shadow-lg",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
    >
      Skip to main content
    </a>
  );
}
