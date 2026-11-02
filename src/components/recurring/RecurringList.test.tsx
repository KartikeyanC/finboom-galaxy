import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const deleteMany = vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined);

const item = (id: string, name: string, is_active: boolean) => ({
  id,
  name,
  is_active,
  type: "expense",
  amount: 500,
  currency: "INR",
  fx_rate: 1,
  category: "Rent",
  frequency: "monthly",
  next_due_date: "2026-12-15",
  icon: null,
  notes: null,
});

vi.mock("@/hooks/useRecurring", () => ({
  useRecurring: () => ({
    data: [item("r1", "Rent", true), item("r2", "Gym", true), item("r3", "Old plan", false)],
    isLoading: false,
  }),
  useMarkRecurring: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRecurring: () => ({ mutate: vi.fn() }),
  useDeleteRecurrings: () => ({ mutateAsync: deleteMany }),
}));
vi.mock("@/hooks/useRecurringReminders", () => ({
  useRecurringReminders: () => ({ settings: {}, save: vi.fn() }),
}));

import RecurringList from "./RecurringList";

describe("RecurringList bulk delete", () => {
  it("select all ticks only the active cards and deletes them in one batch", async () => {
    render(<RecurringList type="expense" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 2 recurring items?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteMany).toHaveBeenCalledTimes(1));
    expect(deleteMany.mock.calls[0][0].sort()).toEqual(["r1", "r2"]);
  });
});
