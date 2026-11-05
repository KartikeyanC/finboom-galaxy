import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.hoisted(() =>
  vi.fn(async (name: string) =>
    name === "po_pending_account_deletions"
      ? {
          data: [
            {
              id: "r1",
              user_id: "u1",
              requester_email: "gone@example.com",
              requested_at: "2026-10-01T10:00:00Z",
              purge_after: "2026-10-31T10:00:00Z",
              owned_tenants: 2,
            },
          ],
          error: null,
        }
      : { data: null, error: null },
  ),
);
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PoAccountDeletions from "./PoAccountDeletions";

describe("PoAccountDeletions", () => {
  it("lists due requests and records what was done", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PoAccountDeletions />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("gone@example.com")).toBeInTheDocument();
    expect(screen.getByText(/owns 2 workspaces/)).toBeInTheDocument();

    const done = screen.getByRole("button", { name: "Mark done" });
    expect(done).toBeDisabled(); // a note is required — it is the audit trail
    fireEvent.change(screen.getByLabelText(/What was done for gone@example.com/), {
      target: { value: "2 workspaces purged, auth user deleted" },
    });
    fireEvent.click(done);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("complete_account_deletion", {
        p_id: "r1",
        p_note: "2 workspaces purged, auth user deleted",
      }),
    );
  });
});
