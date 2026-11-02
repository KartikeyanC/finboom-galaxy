import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { TrackerWithSpend } from "@/lib/trackers";

const { softDeleteOne, softDeleteMany, idle } = vi.hoisted(() => ({
  softDeleteOne: vi.fn(),
  softDeleteMany: vi.fn(async (ids: string[]) => void ids),
  idle: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ isDark: true }) }));

const tracker = (id: string, name: string, status: TrackerWithSpend["status"]): TrackerWithSpend => ({
  id,
  user_id: null,
  tenant_id: "t1",
  name,
  type: "Custom",
  start_date: "2026-01-01",
  end_date: null,
  budget: null,
  currency: "INR",
  description: null,
  status,
  completed_at: null,
  archived_at: null,
  deleted_at: null,
  reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  derivedSpent: 0,
  inflow: 0,
  txnCount: 0,
  utilization: 0,
  remaining: null,
});

vi.mock("@/hooks/useTrackerSpend", () => ({
  useTrackerSpend: () => ({
    data: [
      tracker("a", "Alpha", "active"),
      tracker("b", "Beta", "active"),
      tracker("c", "Gamma", "completed"),
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// Every tracker mutation, with the soft deletes spied on. There is no hard
// delete hook to reach for — that is the point of ADR-0010.
vi.mock("@/hooks/useTrackers", () => ({
  useCreateTracker: idle,
  useUpdateTracker: idle,
  useSetTrackerStatus: idle,
  useMarkTrackerReviewed: idle,
  useSoftDeleteTracker: () => ({ mutate: softDeleteOne, isPending: false }),
  useSoftDeleteTrackers: () => ({ mutateAsync: softDeleteMany, isPending: false }),
}));
vi.mock("@/hooks/useTrackerTransactions", () => ({ useAssignToTracker: idle }));
vi.mock("@/components/trackers/TrackerWorkspace", () => ({ default: () => null }));
vi.mock("@/components/trackers/TrackerDialog", () => ({ default: () => null }));
vi.mock("@/components/trackers/HistoricalReviewDialog", () => ({ default: () => null }));

import Trackers from "./Trackers";

const renderPage = () =>
  render(
    <MemoryRouter>
      <Trackers />
    </MemoryRouter>,
  );

describe("Trackers bulk delete", () => {
  beforeEach(() => {
    softDeleteOne.mockClear();
    softDeleteMany.mockClear();
  });

  it("select all ticks only the tab on screen", () => {
    renderPage();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select Gamma" })).toBeNull();
  });

  it("soft-deletes the ticked trackers in one call, after one confirm", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 1 tracker?")).toBeInTheDocument();
    expect(screen.getByText(/Your transactions are not changed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(softDeleteMany).toHaveBeenCalledWith(["b"]));
    expect(softDeleteOne).not.toHaveBeenCalled();
  });
});
