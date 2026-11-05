import { describe, it, expect } from "vitest";
import { daysLeft, inviteMessage, inviteSubject, mailtoHref, whatsappHref } from "./inviteShare";

const invite = {
  email: "asha@example.com",
  link: "https://finroot.app/invite/abc",
  role: "viewer",
  workspace: "Home & Family",
  expiresAt: "2026-11-19T10:00:00Z",
};

describe("inviteShare", () => {
  it("names the workspace, the link, the address and the expiry", () => {
    expect(inviteSubject(invite)).toBe('Join "Home & Family" on FinRoot');
    const msg = inviteMessage(invite);
    expect(msg).toContain('"Home & Family"');
    expect(msg).toContain("able to view");
    expect(msg).toContain(invite.link);
    expect(msg).toContain("sign up with asha@example.com");
    expect(msg).toMatch(/expires on 19 Nov 2026/);
  });

  it("falls back when the workspace or expiry is unknown", () => {
    const msg = inviteMessage({ ...invite, workspace: null, expiresAt: null, role: "admin" });
    expect(msg).toContain("my workspace");
    expect(msg).toContain("add and edit entries");
    expect(msg).toContain("expires in 14 days");
  });

  it("builds mailto and WhatsApp links with everything encoded", () => {
    const mail = mailtoHref(invite);
    expect(mail.startsWith("mailto:asha%40example.com?subject=")).toBe(true);
    const url = new URL(mail.replace("mailto:", "http://x/"));
    expect(url.searchParams.get("subject")).toBe(inviteSubject(invite));
    expect(url.searchParams.get("body")).toBe(inviteMessage(invite));

    const wa = new URL(whatsappHref(invite));
    expect(wa.host).toBe("wa.me");
    expect(wa.searchParams.get("text")).toBe(inviteMessage(invite));
  });

  it("counts days left, rounding up", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    expect(daysLeft("2026-11-19T10:00:00Z", now)).toBe(14);
    expect(daysLeft("2026-11-05T13:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-11-04T12:00:00Z", now)).toBeLessThanOrEqual(0);
  });
});
