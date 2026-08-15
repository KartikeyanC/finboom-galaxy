import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MatrixFilter from "./MatrixFilter";

/**
 * BUG-027. The filter opens on "today", which is right for a ledger and wrong
 * for anything whose date is *when the record was saved*. The investments
 * portfolio passes `savedAt`, so a holding entered last month was filtered out
 * on arrival and the page greeted its owner with an empty state — indis-
 * tinguishable from having lost the data.
 *
 * These render the real component rather than testing `presetRange`, because
 * the bug was never in the arithmetic: it was in which preset the component
 * starts on and whether a caller can say otherwise.
 */

type Row = { id: string; date: Date; label: string };

const rows: Row[] = [
  { id: "old", date: new Date(Date.now() - 45 * 86_400_000), label: "Saved six weeks ago" },
  { id: "new", date: new Date(), label: "Saved today" },
];

function renderFilter(defaultPreset?: "all" | "today") {
  return render(
    <MatrixFilter<Row>
      items={rows}
      getDate={(r) => r.date}
      getCategory={() => "Equity"}
      getAmount={() => 1000}
      allCategories={["Equity"]}
      defaultPreset={defaultPreset}
    >
      {(filtered) => (
        <div>
          {filtered.map((r) => (
            <span key={r.id}>{r.label}</span>
          ))}
        </div>
      )}
    </MatrixFilter>,
  );
}

describe("MatrixFilter's opening date preset", () => {
  it("still defaults to today, so the ledger is unchanged", () => {
    renderFilter();
    expect(screen.getByText("Saved today")).toBeInTheDocument();
    expect(screen.queryByText("Saved six weeks ago")).not.toBeInTheDocument();
  });

  it("shows everything when the caller asks for all — the portfolio case", () => {
    renderFilter("all");
    expect(screen.getByText("Saved today")).toBeInTheDocument();
    expect(screen.getByText("Saved six weeks ago")).toBeInTheDocument();
  });
});
