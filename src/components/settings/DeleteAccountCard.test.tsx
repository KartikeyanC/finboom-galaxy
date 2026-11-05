import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DeletionRequest } from "@/lib/accountDeletion";

const state = vi.hoisted(() => ({
  row: null as DeletionRequest | null,
  failed: false,
  request: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "a@b.c" } }) }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ memberships: [{ tenantId: "t1", name: "Home", role: "owner" }] }),
}));
vi.mock("@/hooks/useAccountDeletion", () => ({
  useAccountDeletion: () => ({
    row: state.row,
    loading: false,
    failed: state.failed,
    request: { mutateAsync: state.request, isPending: false },
    cancel: { mutateAsync: state.cancel, isPending: false },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import DeleteAccountCard from "./DeleteAccountCard";

const show = () => render(<MemoryRouter><DeleteAccountCard /></MemoryRouter>);

describe("DeleteAccountCard", () => {
  beforeEach(() => {
    state.row = null;
    state.failed = false;
    state.request.mockReset().mockResolvedValue(undefined);
    state.cancel.mockReset().mockResolvedValue(undefined);
  });

  it("asks for DELETE to be typed before it sends the request", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /I want to delete my account/ }));
    expect(screen.getByText(/You own/)).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Request deletion" });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "delete" } });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
  });

  it("a pending request shows its date and can be cancelled", async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
    state.row = { requested_at: "2026-11-01T10:00:00Z", purge_after: soon, cancelled_at: null, completed_at: null };
    show();
    expect(screen.getByRole("status")).toHaveTextContent(/Deletion requested on/);
    expect(screen.getByRole("status")).toHaveTextContent(/10 days from now/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel the deletion" }));
    await waitFor(() => expect(state.cancel).toHaveBeenCalledTimes(1));
  });

  it("falls back to email when requests can't be read", () => {
    state.failed = true;
    show();
    fireEvent.click(screen.getByRole("button", { name: /I want to delete my account/ }));
    expect(screen.queryByRole("button", { name: "Request deletion" })).toBeNull();
    expect(screen.getByRole("link", { name: /Email the request/ })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:"),
    );
  });
});
