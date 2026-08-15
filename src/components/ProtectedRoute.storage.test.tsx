import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { setLockChoice, setPasswordAuthNow, setPin } from "@/lib/appLock";

/**
 * LOCK-012 — the lock must fail CLOSED.
 *
 * Every read in `lib/appLock.ts` is wrapped in try/catch, which is right (a
 * browser with storage disabled should not white-screen) — but a catch that
 * returns the permissive answer turns "storage is unavailable" into "come in".
 * Blocking storage is the cheapest attack there is: devtools, one line, no
 * credentials. So the interesting question is not whether the app survives it
 * but which side of the door it leaves you on.
 */

const USER = { id: "uid-fail-closed", email: "demo@finroot.app" };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: USER, loading: false, signOut: vi.fn() }),
}));

/** Make every Storage method throw, the way a hard-blocked browser does. */
function blockStorage(which: "localStorage" | "sessionStorage") {
  const boom = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  Object.defineProperty(window, which, {
    configurable: true,
    value: {
      getItem: boom,
      setItem: boom,
      removeItem: boom,
      clear: boom,
      key: boom,
      get length(): number {
        return boom();
      },
    },
  });
}

const realLocal = Object.getOwnPropertyDescriptor(window, "localStorage");
const realSession = Object.getOwnPropertyDescriptor(window, "sessionStorage");

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={["/app"]}>
      <ProtectedRoute>
        <main>the dashboard</main>
      </ProtectedRoute>
    </MemoryRouter>,
  );

describe("LOCK-012 — the route gate with storage blocked", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    if (realLocal) Object.defineProperty(window, "localStorage", realLocal);
    if (realSession) Object.defineProperty(window, "sessionStorage", realSession);
  });

  it("does not render the app when localStorage is unavailable", () => {
    blockStorage("localStorage");
    renderGate();

    // Nothing can be read, so nothing can be trusted: the gate must not
    // conclude "no lock configured, therefore let them in".
    expect(screen.queryByText("the dashboard")).toBeNull();
  });

  it("still does not let you in after declining the PIN offer it falls back to", () => {
    blockStorage("localStorage");
    renderGate();

    // The fallback is the PIN offer — and "Not now" writes the declined choice
    // to the storage that is broken, so it cannot become a way through.
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(screen.queryByText("the dashboard")).toBeNull();
  });

  /**
   * BUG-092 — the half the original case did not specify, and the half that
   * was actually open. With the PIN readable and only the per-tab store
   * broken, `isUnlocked()` returned `true` from its catch and the gate handed
   * over the dashboard without drawing a single PIN box.
   */
  it("asks for the PIN when only sessionStorage is unavailable", async () => {
    await setPin(USER.id, "4321");
    setLockChoice(USER.id, true);
    // Inside the 12-hour window, so the gate is in its everyday PIN form —
    // without the anchor it would ask for the password, which is a different
    // rule and would hide the one under test.
    setPasswordAuthNow(USER.id);
    blockStorage("sessionStorage");

    renderGate();

    expect(screen.queryByText("the dashboard")).toBeNull();
    expect(screen.getByText(/enter your \d-digit pin/i)).toBeTruthy();
  });
});
