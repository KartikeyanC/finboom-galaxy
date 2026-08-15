import { describe, it, expect } from "vitest";
import {
  DEFAULT_NOTICE,
  DEGRADED_MS,
  STATE_LABEL,
  STATUS_KEY,
  normalizeStatusNotice,
  overallStatus,
  relativeTime,
  stateForLatency,
  type ServiceCheck,
  type StatusNotice,
} from "./status";

/**
 * Stage 5.7. A status page has one job during an incident: do not be wrong in
 * the reassuring direction. These tests pin the rule that makes that true —
 * the worse of the probes and the operator's notice wins.
 */

const check = (id: string, state: ServiceCheck["state"], ms?: number): ServiceCheck => ({
  id,
  label: id,
  description: "",
  state,
  ms,
});

const notice = (over: Partial<StatusNotice>): StatusNotice => ({ ...DEFAULT_NOTICE, ...over });

describe("latency", () => {
  it("calls a slow-but-alive service degraded rather than up", () => {
    // A page that only says up/down lies quietly for the whole of a slow day.
    expect(stateForLatency(120)).toBe("operational");
    expect(stateForLatency(DEGRADED_MS)).toBe("degraded");
    expect(stateForLatency(DEGRADED_MS + 1)).toBe("degraded");
  });
});

describe("the overall banner", () => {
  it("is green only when everything settled is green", () => {
    const o = overallStatus([check("api", "operational"), check("auth", "operational")]);
    expect(o.state).toBe("operational");
    expect(o.checking).toBe(false);
    expect(o.headline).toMatch(/operational/i);
  });

  it("reports the worst probe, not the average", () => {
    expect(overallStatus([check("api", "operational"), check("auth", "down")]).state).toBe("down");
    expect(overallStatus([check("api", "degraded"), check("auth", "operational")]).state).toBe("degraded");
  });

  it("🔴 never lets a green operator notice hide a failing probe", () => {
    const o = overallStatus([check("api", "down")], notice({ state: "operational", headline: "All good" }));
    expect(o.state).toBe("down");
    expect(o.headline).not.toBe("All good");
  });

  it("🔴 never lets a green probe hide what the operator declared", () => {
    // The operator can see things a browser probe cannot — a data problem, a
    // provider incident, maintenance.
    const o = overallStatus(
      [check("api", "operational"), check("auth", "operational")],
      notice({ state: "degraded", headline: "Investment prices are delayed" }),
    );
    expect(o.state).toBe("degraded");
    expect(o.headline).toBe("Investment prices are delayed");
  });

  it("uses the operator's words when the operator is the reason we are not green", () => {
    const o = overallStatus([check("api", "operational")], notice({ state: "maintenance", headline: "Back at 02:00" }));
    expect(o.state).toBe("maintenance");
    expect(o.headline).toBe("Back at 02:00");
  });

  it("falls back to its own headline when the notice has none", () => {
    const o = overallStatus([check("api", "down")], notice({ state: "outage", headline: "" }));
    expect(o.headline).toMatch(/problem/i);
  });

  it("says it is still checking rather than declaring anything", () => {
    const o = overallStatus([check("api", "checking"), check("auth", "operational")]);
    expect(o.checking).toBe(true);
    expect(o.state).toBe("operational"); // nothing settled is bad — yet
  });

  it("treats an outage and an unreachable probe as equally bad", () => {
    expect(overallStatus([check("api", "down")]).state).toBe("down");
    expect(overallStatus([], notice({ state: "outage" })).state).toBe("outage");
  });

  it("labels every state in words, not colour alone", () => {
    for (const s of ["checking", "operational", "maintenance", "degraded", "down", "outage"] as const) {
      expect(STATE_LABEL[s].length).toBeGreaterThan(3);
    }
  });
});

describe("the stored notice", () => {
  it("is anon-readable by construction", () => {
    // RLS on site_settings allows anon SELECT only for `landing_*`. A different
    // prefix would make the status page invisible to signed-out visitors —
    // exactly the people reading it during an incident.
    expect(STATUS_KEY.startsWith("landing_")).toBe(true);
  });

  it("survives anything the column can hold", () => {
    expect(normalizeStatusNotice(null)).toEqual(DEFAULT_NOTICE);
    expect(normalizeStatusNotice("nonsense")).toEqual(DEFAULT_NOTICE);
    expect(normalizeStatusNotice({ state: "on fire" })).toMatchObject({ state: "operational" });
    expect(normalizeStatusNotice({ state: "outage", headline: "x", detail: "y", updated_at: "z" })).toEqual({
      state: "outage",
      headline: "x",
      detail: "y",
      updated_at: "z",
    });
  });

  it("defaults to operational, so a missing row reads as 'nothing reported'", () => {
    expect(DEFAULT_NOTICE.state).toBe("operational");
    expect(DEFAULT_NOTICE.headline).toBe("");
  });
});

describe("relative time", () => {
  const now = new Date("2026-08-12T12:00:00Z");
  it("reads as an age, because an absolute time reads as stale", () => {
    expect(relativeTime("2026-08-12T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-08-12T11:55:00Z", now)).toBe("5 minutes ago");
    expect(relativeTime("2026-08-12T11:00:00Z", now)).toBe("1 hour ago");
    expect(relativeTime("2026-08-10T12:00:00Z", now)).toBe("2 days ago");
  });

  it("says nothing rather than NaN when there is no timestamp", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("not a date", now)).toBe("");
  });
});
