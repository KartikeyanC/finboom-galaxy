import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { deleteMany, mutation } = vi.hoisted(() => ({
  deleteMany: vi.fn().mockResolvedValue(undefined),
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useBudgets", () => ({
  useSetBudgetAllocation: mutation,
  useDeleteBudget: mutation,
  useDeleteBudgets: () => ({ ...mutation(), mutateAsync: deleteMany }),
}));

const row = (id: string, bucket: string, period_start: string) => ({
  id, bucket, period_start, period: "monthly", allocated: 1000, spent: 0, derivedSpent: 200, remaining: 800,
});

vi.mock("@/hooks/useBudgetSpend", () => ({
  useBudgetSpend: () => ({
    isLoading: false,
    data: [row("b1", "Needs", "2026-10-01"), row("b2", "Wants", "2026-10-01"), row("b3", "Needs", "2026-11-01")],
  }),
}));

import BudgetManager from "./BudgetManager";

describe("BudgetManager bulk delete", () => {
  it("removes the ticked allocations in one batch and says what goes", async () => {
    render(<BudgetManager />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Needs 2026-10-01" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Needs 2026-11-01" }));
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));

    expect(await screen.findByText("Delete 2 budgets?")).toBeInTheDocument();
    expect(screen.getByText(/removes the allocation for each selected bucket and period/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteMany).toHaveBeenCalledWith(["b1", "b3"]));
  });
});
