import { describe, it, expect } from "vitest";
import { deletionState } from "./accountDeletion";

const now = new Date("2026-11-05T10:00:00Z");
const req = (p: Partial<Parameters<typeof deletionState>[0]> = {}) => ({
  requested_at: "2026-11-01T10:00:00Z",
  purge_after: "2026-12-01T10:00:00Z",
  cancelled_at: null,
  completed_at: null,
  ...p,
});

describe("deletionState", () => {
  it("nothing asked, or asked and cancelled", () => {
    expect(deletionState(null, now)).toEqual({ kind: "none" });
    expect(deletionState(req({ cancelled_at: "2026-11-02T00:00:00Z" }), now)).toEqual({ kind: "none" });
  });

  it("pending, with the whole days left to cancel", () => {
    expect(deletionState(req(), now)).toMatchObject({ kind: "pending", daysLeft: 26 });
    expect(deletionState(req({ purge_after: "2026-11-05T10:00:01Z" }), now)).toMatchObject({ daysLeft: 1 });
  });

  it("due once the window is over; done once the operator has finished", () => {
    expect(deletionState(req({ purge_after: "2026-11-05T10:00:00Z" }), now).kind).toBe("due");
    expect(deletionState(req({ completed_at: "2026-12-02T00:00:00Z" }), now).kind).toBe("done");
  });
});
