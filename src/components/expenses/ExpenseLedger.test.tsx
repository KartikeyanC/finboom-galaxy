import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Transaction } from "@/hooks/useTransactions";

const deleteMany = vi.fn<(ids: string[]) => Promise<void>>();
const deleteOne = vi.fn();

const tx = (id: string, category: string, description: string): Transaction =>
  ({
    id,
    type: "expense",
    category,
    description,
    amount: 100,
    currency: "INR",
    occurred_at: "2026-10-30T09:00:00Z",
    tracker_id: null,
  }) as unknown as Transaction;

const rows = [
  tx("t1", "Food & Dining", "Lunch"),
  tx("t2", "Food & Dining", "Dinner"),
  tx("t3", "Transport", "Cab"),
];

vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({ data: rows, isLoading: false }),
  useDeleteTransaction: () => ({ mutateAsync: deleteOne }),
  useDeleteTransactions: () => ({ mutateAsync: deleteMany }),
}));
vi.mock("@/hooks/useTrackers", () => ({ useTrackerNameMap: () => new Map() }));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ isDark: true }) }));
vi.mock("@/components/ledger/PeriodSelect", () => ({ default: () => null }));
vi.mock("@/components/transactions/TransactionDialog", () => ({ default: () => null }));
// The matrix filter is its own component with its own tests; here it passes
// everything through so the ledger's own narrowing (the chips) is what shows.
vi.mock("@/components/filters/MatrixFilter", () => ({
  default: ({ items, children }: { items: unknown[]; children: (f: unknown[]) => ReactNode }) => (
    <>{children(items)}</>
  ),
}));

import ExpenseLedger from "./ExpenseLedger";

describe("ExpenseLedger bulk delete", () => {
  beforeEach(() => {
    deleteMany.mockReset().mockResolvedValue(undefined);
  });

  it("ticks the shown entries and deletes them in one batch after one confirm", async () => {
    render(<ExpenseLedger />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 3 expenses?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteMany).toHaveBeenCalledTimes(1));
    expect(deleteMany.mock.calls[0][0].sort()).toEqual(["t1", "t2", "t3"]);
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it("select all only ticks what the filter chip leaves on screen", async () => {
    render(<ExpenseLedger />);
    fireEvent.click(screen.getByRole("button", { name: "Food & Dining" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMany).toHaveBeenCalledTimes(1));
    expect(deleteMany.mock.calls[0][0].sort()).toEqual(["t1", "t2"]);
  });

  it("one row can be ticked on its own", () => {
    render(<ExpenseLedger />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Cab" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });
});
