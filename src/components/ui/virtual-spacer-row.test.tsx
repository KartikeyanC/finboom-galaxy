import { describe, expect, it } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { useVirtualRows, VIRTUALIZE_THRESHOLD } from "@/hooks/useVirtualRows";
import { VirtualSpacerRow } from "./virtual-spacer-row";

/**
 * Stage 4.5. jsdom has no layout, so measured heights are meaningless here —
 * what these tests pin down is the THRESHOLD GATE, which is the part that can
 * silently break a table.
 *
 * The failure that matters: if `enabled` were true while the spacers stayed 0
 * (or vice versa) the table would render blank or double-count its height. So
 * the invariant under test is that "not enabled" is completely inert.
 */

describe("useVirtualRows threshold", () => {
  it("stays inert for an empty list", () => {
    const { result } = renderHook(() => useVirtualRows(0));
    expect(result.current.enabled).toBe(false);
    expect(result.current.virtualItems).toEqual([]);
    expect(result.current.paddingTop).toBe(0);
    expect(result.current.paddingBottom).toBe(0);
  });

  it("stays inert exactly AT the threshold, so ordinary tables are untouched", () => {
    const { result } = renderHook(() => useVirtualRows(VIRTUALIZE_THRESHOLD));
    expect(result.current.enabled).toBe(false);
    // Everything must read as "render the list yourself".
    expect(result.current.virtualItems).toEqual([]);
    expect(result.current.paddingTop).toBe(0);
    expect(result.current.paddingBottom).toBe(0);
  });

  it("switches on one row past the threshold", () => {
    const { result } = renderHook(() => useVirtualRows(VIRTUALIZE_THRESHOLD + 1));
    expect(result.current.enabled).toBe(true);
  });

  it("honours a caller-supplied threshold", () => {
    const low = renderHook(() => useVirtualRows(11, { threshold: 10 }));
    expect(low.result.current.enabled).toBe(true);

    const high = renderHook(() => useVirtualRows(500, { threshold: 1000 }));
    expect(high.result.current.enabled).toBe(false);
  });

  it("defends the documented default", () => {
    // The number is a product decision (find-in-page vs mount cost), not an
    // implementation detail — changing it should be deliberate.
    expect(VIRTUALIZE_THRESHOLD).toBe(200);
  });
});

describe("VirtualSpacerRow", () => {
  const renderInTable = (height: number) =>
    render(
      <table>
        <tbody>
          <VirtualSpacerRow height={height} colSpan={5} />
        </tbody>
      </table>,
    );

  it("renders nothing at zero height, so an inert list gets no stray row", () => {
    const { container } = renderInTable(0);
    expect(container.querySelectorAll("tr")).toHaveLength(0);
  });

  it("renders nothing for a negative height", () => {
    const { container } = renderInTable(-40);
    expect(container.querySelectorAll("tr")).toHaveLength(0);
  });

  it("reserves the scrolled-past height and hides itself from assistive tech", () => {
    const { container } = renderInTable(640);
    const tr = container.querySelector("tr")!;
    expect(tr).toBeTruthy();
    expect(tr.getAttribute("aria-hidden")).toBe("true");
    expect(tr.style.height).toBe("640px");
    // One cell spanning the table, so the spacer cannot skew column widths.
    expect(container.querySelectorAll("td")).toHaveLength(1);
    expect(container.querySelector("td")!.getAttribute("colspan")).toBe("5");
  });

  it("contributes no visible text", () => {
    renderInTable(200);
    expect(screen.queryByText(/\S/)).toBeNull();
  });
});
