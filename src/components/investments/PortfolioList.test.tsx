import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import type { InvestmentRecord } from "@/lib/investmentsStore";

// Live prices hit an edge function; the list only needs the shape back.
vi.mock("@/lib/livePrices", () => ({
  isLiveAsset: (a: string) => a === "stocks",
  useLivePrices: () => ({
    live: {
      itc: {
        unitPrice: 438,
        prevUnitPrice: 438,
        currentValue: 4380,
        prevCurrentValue: 4380,
        quantity: 10,
        updatedAt: 1,
        direction: "down",
      },
    },
    refresh: () => {},
    refreshedAt: Date.now(),
  }),
}));

import PortfolioList from "./PortfolioList";

const stock = (id: string, name: string, qty: number, buy: number): InvestmentRecord => ({
  id,
  asset: "stocks",
  currency: "INR",
  goal: null,
  broker: "Other / Direct Holding",
  fields: { name, ticker: `NSE:${name}`, qty: String(qty), buy: String(buy) },
  derived: { total: qty * buy },
  savedAt: "2026-01-01T00:00:00Z",
});

const records = [stock("itc", "ITC", 10, 410), stock("tmb", "TMB", 5, 500)];

describe("PortfolioList", () => {
  it("shows only the figures that matter, in fixed columns, two decimals", () => {
    render(<PortfolioList records={records} onEdit={() => {}} onDelete={() => {}} />);
    for (const h of ["Holding", "LTP", "Invested", "Current", "P&L"]) {
      expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
    const itc = screen.getAllByRole("row").find((r) => within(r).queryByText("ITC"))!;
    expect(within(itc).getByText("₹438.00")).toBeInTheDocument();
    expect(within(itc).getAllByText("₹4,380.00").length).toBeGreaterThan(0);
    expect(within(itc).getAllByText("+₹280.00").length).toBeGreaterThan(0);
    expect(within(itc).getAllByText("+6.83%").length).toBeGreaterThan(0);
    // The clutter is gone from the row: broker, type and currency chips.
    expect(within(itc).queryByText(/via Other/)).toBeNull();
    expect(within(itc).queryByText("INR")).toBeNull();
  });

  it("ticks rows and deletes them together after one confirm", async () => {
    const onDeleteMany = vi.fn();
    render(
      <PortfolioList
        records={records}
        onEdit={() => {}}
        onDelete={() => {}}
        onDeleteMany={onDeleteMany}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 2 holdings?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleteMany).toHaveBeenCalledWith(["itc", "tmb"]));
  });
});
