import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { markSignOutIntent } from "@/lib/appLock";

/**
 * Found via a Playwright run: clicking "Sign out" landed on the sign-in
 * form (/auth) instead of the marketing page (/), every time. Root cause —
 * `signOut()` clearing the session makes `user` go null while
 * ProtectedRoute is still mounted, so it fires its own `<Navigate
 * to="/auth">`, racing the button's own explicit `navigate("/")`. These
 * tests exercise ProtectedRoute's half of the fix directly: it must stand
 * down (render nothing) when a sign-out was marked deliberate, and it must
 * NOT stand down for an ordinary "the session just isn't there" case —
 * that one still needs the real redirect, or a stale tab / expired session
 * would never send anyone back to sign in.
 */

let mockUser: { id: string; email: string } | null = null;
const mockSignOut = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, loading: false, signOut: mockSignOut }),
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

function renderGate() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <main>the dashboard</main>
            </ProtectedRoute>
          }
        />
        <Route path="/auth" element={<div>the sign-in form</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute — the sign-out race", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockUser = null;
  });

  it("redirects to /auth normally when there was no deliberate sign-out (e.g. an expired session)", () => {
    renderGate();
    expect(screen.getByText("the sign-in form")).toBeTruthy();
    expect(screen.queryByText("the dashboard")).toBeNull();
  });

  it("stands down instead of redirecting when a sign-out was marked deliberate", () => {
    markSignOutIntent();
    renderGate();
    // Neither screen renders — the caller's own navigate() is what decides
    // where this lands, not ProtectedRoute.
    expect(screen.queryByText("the sign-in form")).toBeNull();
    expect(screen.queryByText("the dashboard")).toBeNull();
  });

  it("does not keep standing down across renders while the SAME sign-out is still settling", () => {
    // A stable null `user` across renders is one continuous "stood down for
    // this sign-out" state, not a fresh decision each time — otherwise a
    // slow signOut() with several re-renders in between could flip back to
    // the wrong redirect before the button's own navigate() ever runs.
    markSignOutIntent();
    const { rerender } = renderGate();
    expect(screen.queryByText("the sign-in form")).toBeNull();

    rerender(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <main>the dashboard</main>
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<div>the sign-in form</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText("the sign-in form")).toBeNull();
  });

  it("does not leak a consumed marker into a LATER, unrelated sign-out on the same mount", () => {
    // The real thing to guard against: this component staying mounted across
    // sign-in -> sign-out -> sign-in -> (session expires) -- a stale marker
    // from the FIRST sign-out must not suppress the redirect for the SECOND,
    // unmarked one (e.g. a genuine session expiry after signing back in).
    markSignOutIntent();
    mockUser = null;
    const { rerender } = renderGate();
    expect(screen.queryByText("the sign-in form")).toBeNull(); // first sign-out: stood down

    const rerenderWith = () =>
      rerender(
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <main>the dashboard</main>
                </ProtectedRoute>
              }
            />
            <Route path="/auth" element={<div>the sign-in form</div>} />
          </Routes>
        </MemoryRouter>,
      );

    mockUser = { id: "uid-1", email: "demo@finroot.app" }; // signs back in
    rerenderWith();
    // Whichever gate a brand-new mock user lands on next (PIN setup, etc.)
    // is not what this test is about -- only that it isn't still stuck on
    // the sign-in form.
    expect(screen.queryByText("the sign-in form")).toBeNull();

    mockUser = null; // a later, unrelated session expiry -- never marked
    rerenderWith();
    expect(screen.getByText("the sign-in form")).toBeTruthy();
  });

  it("does not leak into a later sign-out that never marked the intent", () => {
    // No markSignOutIntent() here — simulates a session simply expiring.
    renderGate();
    expect(screen.getByText("the sign-in form")).toBeTruthy();
  });
});
