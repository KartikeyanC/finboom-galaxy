import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const token = "b".repeat(64);

const s = vi.hoisted(() => ({
  user: null as null | { id: string; created_at: string },
  rpc: vi.fn(),
  members: [] as unknown[],
  refresh: vi.fn(async () => {}),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: s.user, loading: false }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ refresh: s.refresh }) }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq"]) chain[m] = () => chain;
  chain.limit = async () => ({ data: s.members, error: null });
  return { supabase: { rpc: s.rpc, from: () => chain } };
});

import AcceptInvite from "./AcceptInvite";

function AuthPage() {
  const loc = useLocation();
  return <div>auth from {(loc.state as { from?: { pathname?: string } })?.from?.pathname}</div>;
}

const show = () =>
  render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/auth" element={<AuthPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("AcceptInvite", () => {
  beforeEach(() => {
    sessionStorage.clear();
    s.user = null;
    s.members = [];
    s.rpc.mockReset();
  });

  it("signed out: keeps the token and sends them to sign in with a way back", async () => {
    show();
    expect(await screen.findByText(`auth from /invite/${token}`)).toBeInTheDocument();
    expect(sessionStorage.getItem("finroot.pendingInvite")).toBe(token);
  });

  it("signed in: accepts and clears the saved token", async () => {
    sessionStorage.setItem("finroot.pendingInvite", token);
    s.user = { id: "u1", created_at: "2025-01-01T00:00:00Z" };
    s.rpc.mockResolvedValue({ data: { role: "viewer" }, error: null });
    show();
    expect(await screen.findByText("You now have viewer access.")).toBeInTheDocument();
    expect(s.rpc).toHaveBeenCalledWith("accept_invitation", { p_token: token });
    expect(sessionStorage.getItem("finroot.pendingInvite")).toBeNull();
  });

  it("a brand-new account already claimed at sign-up is told so, not shown an error", async () => {
    s.user = { id: "u1", created_at: new Date().toISOString() };
    s.rpc.mockResolvedValue({ data: null, error: { message: "That invitation link is not valid any more" } });
    s.members = [{ role: "viewer", tenants: { name: "Home" } }];
    show();
    expect(
      await screen.findByText("You were added to Home when you created your account."),
    ).toBeInTheDocument();
  });

  it("an older account with a used link sees the error", async () => {
    s.user = { id: "u1", created_at: "2025-01-01T00:00:00Z" };
    s.rpc.mockResolvedValue({ data: null, error: { message: "That invitation link is not valid any more" } });
    show();
    expect(await screen.findByText(/This link didn.t work/)).toBeInTheDocument();
  });
});
