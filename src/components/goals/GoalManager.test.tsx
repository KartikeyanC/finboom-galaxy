import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { deleteMany, deleteOne, mutation } = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  deleteOne: vi.fn(),
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useGoals", () => ({
  useGoals: () => ({
    isLoading: false,
    data: [
      { id: "g1", title: "Emergency Fund", category: "Safety", target_amount: 1000, current_amount: 100, currency: "INR", target_date: null, status: "active" },
      { id: "g2", title: "New Car", category: "Vehicle", target_amount: 5000, current_amount: 0, currency: "INR", target_date: null, status: "active" },
      { id: "g3", title: "Trip", category: "Travel", target_amount: 300, current_amount: 300, currency: "INR", target_date: null, status: "completed" },
    ],
  }),
  useCreateGoal: mutation,
  useUpdateGoal: mutation,
  useContributeToGoal: mutation,
  useDeleteGoal: () => ({ ...mutation(), mutateAsync: deleteOne }),
  useDeleteGoals: () => ({ ...mutation(), mutateAsync: deleteMany }),
}));

import GoalManager from "./GoalManager";

describe("GoalManager bulk delete", () => {
  beforeEach(() => {
    deleteMany.mockReset().mockResolvedValue(undefined);
    deleteOne.mockReset();
  });

  it("ticks goals and deletes them in one batch after one confirm", async () => {
    render(<GoalManager />);
    expect(screen.queryByText(/selected/)).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Emergency Fund" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Trip" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 2 goals?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteMany).toHaveBeenCalledTimes(1));
    expect(deleteMany).toHaveBeenCalledWith(["g1", "g3"]);
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it("select all ticks every listed goal", () => {
    render(<GoalManager />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });
});
