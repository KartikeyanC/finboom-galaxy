import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * One PIN per account (20261101120000). A new browser must not offer "Add a
 * PIN" to someone whose account already has one — so the gate waits for the
 * first status check — but a network problem must never trap anyone on the
 * loading screen, so the wait gives up after PIN_SYNC_TIMEOUT_MS.
 */

const USER = { id: "uid-account-pin", email: "demo@finroot.app" };
let statusAnswer: () => Promise<unknown>;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: USER, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useOnboardingWizard", () => ({
  useOnboardingWizard: () => ({
    completed: true,
    step: 1,
    selections: {},
    loading: false,
    saving: false,
    saveStep: vi.fn(),
    complete: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string) =>
      fn === "app_pin_status" ? statusAnswer() : Promise.resolve({ data: null, error: null }),
    auth: { signInWithPassword: vi.fn() },
  },
}));

import { ProtectedRoute } from "./ProtectedRoute";
import { PIN_SYNC_TIMEOUT_MS, resetAccountPinSyncForTests } from "@/hooks/useAccountPinSync";
import { setPasswordAuthNow } from "@/lib/appLock";

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={["/app"]}>
      <ProtectedRoute>
        <main>the dashboard</main>
      </ProtectedRoute>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetAccountPinSyncForTests();
});

afterEach(() => vi.useRealTimers());

describe("the gate and the account PIN", () => {
  it("shows the lock screen, not 'Add a PIN', when the account already has a PIN", async () => {
    statusAnswer = () =>
      Promise.resolve({ data: [{ is_set: true, pin_length: 6, locked_until: null }], error: null });
    // Inside the 12-hour window, so the lock asks for the PIN, not the password.
    setPasswordAuthNow(USER.id);
    renderGate();

    // Before the answer: neither the offer nor the dashboard.
    expect(screen.queryByText(/add a pin/i)).toBeNull();
    expect(screen.queryByText("the dashboard")).toBeNull();

    expect(await screen.findByText(/enter your 6-digit pin/i)).toBeInTheDocument();
    expect(screen.queryByText(/add a pin/i)).toBeNull();
  });

  it("offers the PIN once the server says the account has none", async () => {
    statusAnswer = () =>
      Promise.resolve({ data: [{ is_set: false, pin_length: null, locked_until: null }], error: null });
    renderGate();
    expect(await screen.findByRole("heading", { name: /add a pin/i })).toBeInTheDocument();
  });

  it("behaves exactly as before when the migration is not applied", async () => {
    statusAnswer = () =>
      Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" }, status: 404 });
    renderGate();
    expect(await screen.findByRole("heading", { name: /add a pin/i })).toBeInTheDocument();
  });

  it("gives up waiting after the timeout and falls back to this device's state", async () => {
    vi.useFakeTimers();
    statusAnswer = () => new Promise(() => {}); // the network never answers
    renderGate();
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(PIN_SYNC_TIMEOUT_MS + 10);
    });
    expect(screen.getByRole("heading", { name: /add a pin/i })).toBeInTheDocument();
  });
});
