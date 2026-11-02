import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { DebtRecord } from "@/lib/debtsStore";

const calls: string[] = [];
const debtsRemoveMany = vi.fn(async (ids: string[]) => {
  calls.push(`debts:${ids.sort().join(",")}`);
});
const remindersRemoveMany = vi.fn(async (ids: string[]) => {
  calls.push(`reminders:${ids.sort().join(",")}`);
});

const debt = (id: string, lender: string): DebtRecord => ({
  id,
  lender,
  category: "Loan",
  currency: "INR",
  totalAmount: 12000,
  duration: 12,
  monthly: 1000,
  firstDueDate: "2026-11-01",
  installments: [],
  createdAt: "2026-10-01T00:00:00Z",
});

vi.mock("@/lib/debtsStore", async (orig) => ({
  ...(await orig<typeof import("@/lib/debtsStore")>()),
  useDebts: () => ({
    records: [debt("d1", "HDFC"), debt("d2", "Bajaj"), debt("d3", "SBI")],
    remove: vi.fn(),
    removeMany: debtsRemoveMany,
  }),
}));
vi.mock("@/lib/remindersStore", () => ({
  useReminders: () => ({
    records: [
      { id: "rm1", source: "debt", sourceId: "d1", status: "scheduled" },
      { id: "rm2", source: "debt", sourceId: "d1", status: "completed" },
      { id: "rm3", source: "debt", sourceId: "d3", status: "scheduled" },
      { id: "rm4", source: "bills", sourceId: "d1", status: "scheduled" },
    ],
    remove: vi.fn(),
    removeMany: remindersRemoveMany,
  }),
}));

import DebtLedger from "./DebtLedger";

describe("DebtLedger bulk delete", () => {
  it("deletes the ticked debts and their open reminders, reminders first", async () => {
    render(<DebtLedger />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select HDFC" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Bajaj" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 2 debts?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(debtsRemoveMany).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["reminders:rm1", "debts:d1,d2"]);
  });
});
