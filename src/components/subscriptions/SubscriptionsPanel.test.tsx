import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SubscriptionRecord } from "@/lib/subscriptionsStore";

const removeMany = vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined);
const remove = vi.fn();

const sub = (id: string, name: string, renewalDate: string): SubscriptionRecord => ({
  id,
  name,
  icon: "💳",
  amount: 199,
  currency: "INR",
  frequency: "monthly",
  renewalDate,
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
});

vi.mock("@/lib/subscriptionsStore", async (orig) => ({
  ...(await orig<typeof import("@/lib/subscriptionsStore")>()),
  useSubscriptions: () => ({
    items: [sub("s1", "Netflix", "2026-12-01"), sub("s2", "Spotify", "2026-11-20")],
    add: vi.fn(),
    update: vi.fn(),
    remove,
    removeMany,
  }),
}));

import SubscriptionsPanel from "./SubscriptionsPanel";

describe("SubscriptionsPanel bulk delete", () => {
  it("deletes the ticked subscriptions with one batch call", async () => {
    render(<SubscriptionsPanel />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Netflix" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Spotify" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 2 subscriptions?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(removeMany).toHaveBeenCalledTimes(1));
    expect(removeMany.mock.calls[0][0].sort()).toEqual(["s1", "s2"]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps the single-row delete", () => {
    render(<SubscriptionsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Netflix" }));
    expect(remove).toHaveBeenCalledWith("s1");
  });
});
