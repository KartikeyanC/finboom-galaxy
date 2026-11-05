import { describe, it, expect, beforeEach } from "vitest";
import { clearPendingInvite, peekPendingInvite, savePendingInvite } from "./pendingInvite";

const token = "a".repeat(64);

describe("pendingInvite", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps a token in this tab's session until cleared", () => {
    savePendingInvite(token);
    expect(sessionStorage.getItem("finroot.pendingInvite")).toBe(token);
    expect(localStorage.getItem("finroot.pendingInvite")).toBeNull();
    expect(peekPendingInvite()).toBe(token);
    clearPendingInvite();
    expect(peekPendingInvite()).toBeNull();
  });

  it("ignores anything that is not an invitation token", () => {
    savePendingInvite("../../app/settings");
    expect(peekPendingInvite()).toBeNull();
    sessionStorage.setItem("finroot.pendingInvite", "x/../y");
    expect(peekPendingInvite()).toBeNull();
  });
});
