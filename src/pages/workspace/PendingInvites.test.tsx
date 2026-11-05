import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const soon = new Date(Date.now() + 3 * 86_400_000 - 60_000).toISOString();
const gone = new Date(Date.now() - 86_400_000).toISOString();

const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  rpc: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "is"]) chain[m] = () => chain;
  chain.order = async () => ({ data: db.rows, error: null });
  return {
    supabase: {
      from: () => ({
        select: (cols: string) => {
          db.select(cols);
          return chain;
        },
      }),
      rpc: db.rpc,
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PendingInvites from "./PendingInvites";

const show = (onNewLink = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PendingInvites tenantId="t1" workspace="Home" onNewLink={onNewLink} />
    </QueryClientProvider>,
  );
  return onNewLink;
};

describe("PendingInvites", () => {
  beforeEach(() => {
    db.rows = [
      { id: "i1", email: "asha@example.com", role: "viewer", menu_overrides: { allow: ["income"] }, expires_at: soon },
      { id: "i2", email: "ravi@example.com", role: "admin", menu_overrides: null, expires_at: gone },
    ];
    db.rpc.mockReset();
    db.select.mockReset();
  });

  it("lists unused invitations without reading the token hash", async () => {
    show();
    expect(await screen.findByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByText("Expires in 3 days")).toBeInTheDocument();
    expect(screen.getByText(/Expired — make a new link/)).toBeInTheDocument();
    expect(db.select).toHaveBeenCalledWith(expect.not.stringContaining("token"));
  });

  it("a new link keeps the email, role and modules, and hands the link up", async () => {
    db.rpc.mockResolvedValue({ data: [{ token: "f".repeat(64), expires_at: soon }], error: null });
    const onNewLink = show();
    fireEvent.click((await screen.findAllByRole("button", { name: /New link/ }))[0]);
    await waitFor(() => expect(onNewLink).toHaveBeenCalled());
    expect(db.rpc).toHaveBeenCalledWith("create_invitation", {
      p_tenant_id: "t1",
      p_email: "asha@example.com",
      p_role: "viewer",
      p_menus: { allow: ["income"] },
    });
    expect(onNewLink.mock.calls[0][0]).toMatchObject({
      email: "asha@example.com",
      workspace: "Home",
      link: expect.stringMatching(/\/invite\/f{64}$/),
    });
  });

  it("withdraws an invitation", async () => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw the invitation for ravi@example.com" }));
    await waitFor(() =>
      expect(db.rpc).toHaveBeenCalledWith("revoke_invitation", { p_invitation_id: "i2" }),
    );
  });

  it("shows nothing when there are no pending invitations", async () => {
    db.rows = [];
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <PendingInvites tenantId="t1" onNewLink={vi.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(db.select).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
