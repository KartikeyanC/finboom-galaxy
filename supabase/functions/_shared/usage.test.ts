import { describe, it, expect, vi } from "vitest";
import { metered } from "./usage";

const req = (method = "POST") => new Request("https://x/fn", { method });

describe("metered", () => {
  it("records the response status and returns the response untouched", async () => {
    const record = vi.fn(async () => {});
    const res = new Response("ok", { status: 201 });
    const out = await metered("live-price", () => res, record)(req());
    expect(out).toBe(res);
    expect(record).toHaveBeenCalledWith("live-price", 201);
  });

  it("records a crash as a 500 and still throws it", async () => {
    const record = vi.fn(async () => {});
    const boom = metered("scan-receipt", () => { throw new Error("boom"); }, record);
    await expect(boom(req())).rejects.toThrow("boom");
    expect(record).toHaveBeenCalledWith("scan-receipt", 500);
  });

  it("a failing recorder never reaches the caller", async () => {
    const record = vi.fn(async () => { throw new Error("db down"); });
    const out = await metered("po-auth", () => new Response("hi"), record)(req());
    expect(await out.text()).toBe("hi");
    await Promise.resolve();
  });

  it("does not count CORS preflights", async () => {
    const record = vi.fn(async () => {});
    await metered("billing-api", () => new Response(null, { status: 204 }), record)(req("OPTIONS"));
    expect(record).not.toHaveBeenCalled();
  });
});
