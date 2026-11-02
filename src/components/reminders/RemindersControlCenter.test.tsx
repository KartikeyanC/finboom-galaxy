import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { removeMany, remove } = vi.hoisted(() => ({
  removeMany: vi.fn(async (ids: string[]) => void ids),
  remove: vi.fn(),
}));

vi.mock("@/lib/remindersStore", async (orig) => ({
  ...(await orig<typeof import("@/lib/remindersStore")>()),
  useReminders: () => ({
    records: [
      { id: "r1", title: "Rent", context: "fixed_due", date: "2027-03-01", createdAt: "2026-01-01" },
      { id: "r2", title: "Card bill", context: "fixed_due", date: "2027-02-01", createdAt: "2026-01-01" },
    ],
    upsert: vi.fn(),
    remove,
    removeMany,
    complete: vi.fn(),
  }),
}));
vi.mock("@/lib/debtsStore", () => ({ useDebts: () => ({ markPaid: vi.fn() }) }));
vi.mock("@/hooks/useTransactions", () => ({
  useCreateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./ReminderEditorDialog", () => ({ ReminderEditorDialog: () => null }));

import { RemindersControlCenter } from "./RemindersControlCenter";

describe("RemindersControlCenter bulk delete", () => {
  it("deletes the ticked reminders in one batch after one confirm", async () => {
    render(<RemindersControlCenter />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 2 reminders?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    // Sorted by date, so the card bill comes first.
    await waitFor(() => expect(removeMany).toHaveBeenCalledWith(["r2", "r1"]));
    expect(remove).not.toHaveBeenCalled();
  });
});
