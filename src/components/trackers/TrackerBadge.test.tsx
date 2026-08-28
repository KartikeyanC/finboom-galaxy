import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TrackerBadge from "./TrackerBadge";

/**
 * The badge's accessibility contract, pinned.
 *
 * The visible text is CSS-truncated and carries a "T-" prefix that is a
 * display convention, not part of the name. Both of those are decisions that
 * can silently cost a screen-reader user information, so both are asserted
 * here rather than trusted to survive future styling edits.
 */
describe("TrackerBadge", () => {
  const LONG = "Home Construction — Phase Two, East Wing and Roof";

  it("exposes the full name even when the visible text is truncated", () => {
    render(<TrackerBadge name={LONG} isLight={false} />);
    // Truncation is visual only (max-w + truncate). If someone ever replaces
    // it with a JS slice, this fails — which is the point.
    expect(screen.getByText(`Tracker: ${LONG}`)).toBeInTheDocument();
  });

  it("hides the T- prefix from assistive tech", () => {
    const { container } = render(<TrackerBadge name="Home Construction" isLight={false} />);
    const prefix = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "T-",
    );
    expect(prefix).toBeTruthy();
    // "tee dash home construction" is punctuation read as content.
    expect(prefix).toHaveAttribute("aria-hidden", "true");
  });

  it("never renders the prefix as part of the announced name", () => {
    render(<TrackerBadge name="Home Construction" isLight={false} />);
    expect(screen.getByText("Tracker: Home Construction")).toBeInTheDocument();
    expect(screen.queryByText("Tracker: T-Home Construction")).not.toBeInTheDocument();
  });

  it("carries a title so sighted mouse users recover a truncated name too", () => {
    const { container } = render(<TrackerBadge name={LONG} isLight={false} />);
    expect(container.querySelector(`[title="${LONG}"]`)).toBeTruthy();
  });

  it("renders in both themes without losing the accessible name", () => {
    for (const isLight of [true, false]) {
      const { unmount } = render(<TrackerBadge name="Wedding" isLight={isLight} />);
      expect(screen.getByText("Tracker: Wedding")).toBeInTheDocument();
      unmount();
    }
  });
});
