import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BillingPage from "./Billing";

/**
 * OPS-011 — "Missing Paddle token → Billing degrades with a message; no crash."
 *
 * `VITE_PAYMENTS_CLIENT_TOKEN` is unset in every environment this repo has run
 * in so far (no Paddle sandbox exists — see REMAINING_TESTS.md §13/§14), so
 * this is the page's normal, everyday state, not an edge case. There was no
 * automated proof of it before this: `payments.test.ts` covers the pure
 * `paymentsConfigured()` signal, but nothing exercised the actual page render.
 */

const FAKE_PLANS = [
  { id: "p1", name: "Canopy", price_cents: 49900, currency: "INR", interval: "month", is_active: true },
];

const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  order: vi.fn(() => Promise.resolve({ data: FAKE_PLANS, error: null })),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { subscription: null, transactions: [], role: "owner" },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn(() => chain),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "owner@example.com" } }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    currentTenantId: "t1",
    memberships: [{ tenantId: "t1", name: "Test Workspace" }],
  }),
}));

function renderBilling() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Billing page with no payment gateway configured", () => {
  it("renders without throwing", async () => {
    expect(() => renderBilling()).not.toThrow();
    // Let the async plan/subscription fetches settle before the test ends,
    // so later tests don't see an act() warning from this one's leftover work.
    await waitFor(() => screen.getByText(/self-serve checkout isn.t available yet/i));
  });

  it("shows the manual-upgrade message instead of a dead checkout button", async () => {
    renderBilling();
    expect(
      await screen.findByText(/self-serve checkout isn.t available yet/i),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /contact us/i })).toBeTruthy();
  });

  it("never renders a live Paddle checkout button", async () => {
    renderBilling();
    await waitFor(() => screen.getByText(/self-serve checkout isn.t available yet/i));
    expect(screen.queryByText(/^Upgrade to /)).toBeNull();
  });
});
