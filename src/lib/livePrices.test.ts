import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  __clearPriceMemo,
  cacheKey,
  planBatch,
  readMemo,
  resolveSymbol,
  useLivePrices,
  writeMemo,
  type Provider,
} from "./livePrices";
import type { InvestmentRecord } from "./investmentsStore";

function rec(
  id: string,
  asset: InvestmentRecord["asset"],
  fields: Record<string, string>,
): InvestmentRecord {
  return {
    id,
    asset,
    currency: "INR",
    goal: null,
    fields,
    derived: {},
    savedAt: new Date().toISOString(),
  };
}

describe("resolveSymbol", () => {
  it("maps an exchange prefix to the Yahoo suffix", () => {
    expect(resolveSymbol(rec("1", "stocks", { ticker: "NSE:RELIANCE" }))).toEqual({
      provider: "yahoo",
      symbol: "RELIANCE.NS",
    });
    expect(resolveSymbol(rec("2", "stocks", { ticker: "BSE:TCS" }))).toEqual({
      provider: "yahoo",
      symbol: "TCS.BO",
    });
  });

  it("leaves US tickers unsuffixed", () => {
    expect(resolveSymbol(rec("3", "stocks", { ticker: "NASDAQ:AAPL" })).symbol).toBe("AAPL");
  });

  it("pairs a bare crypto symbol against USD but respects an explicit pair", () => {
    expect(resolveSymbol(rec("4", "crypto", { coin: "btc" })).symbol).toBe("BTC-USD");
    expect(resolveSymbol(rec("5", "crypto", { coin: "ETH-EUR" })).symbol).toBe("ETH-EUR");
  });

  it("pulls the scheme code out of a mutual fund name", () => {
    expect(resolveSymbol(rec("6", "mutual_funds", { scheme: "Parag Parikh 122639" }))).toEqual({
      provider: "mf",
      symbol: "122639",
    });
  });

  it("returns no provider when there is nothing to look up", () => {
    expect(resolveSymbol(rec("7", "stocks", {})).provider).toBeNull();
    // A 3-digit number is not a scheme code, so this must not be queried.
    expect(resolveSymbol(rec("8", "mutual_funds", { scheme: "Fund 123" })).provider).toBeNull();
  });
});

describe("planBatch", () => {
  it("dedupes the same symbol held more than once", () => {
    const plan = planBatch([
      rec("a", "stocks", { ticker: "NSE:RELIANCE" }),
      rec("b", "stocks", { ticker: "NSE:RELIANCE" }), // second broker
      rec("c", "stocks", { ticker: "NSE:INFY" }),
    ]);
    expect(plan.wants).toHaveLength(2);
    expect(plan.targets.get("yahoo:RELIANCE.NS")).toEqual(["a", "b"]);
  });

  it("ignores assets that have no live price", () => {
    const plan = planBatch([
      rec("a", "fd", { bank: "HDFC" }),
      rec("b", "gold", {}),
      rec("c", "crypto", { coin: "BTC" }),
    ]);
    expect(plan.wants).toEqual([{ provider: "yahoo", symbol: "BTC-USD" }]);
  });

  it("separates live records that cannot be resolved", () => {
    const plan = planBatch([rec("a", "stocks", {}), rec("b", "stocks", { ticker: "NSE:INFY" })]);
    expect(plan.unresolved).toEqual(["a"]);
    expect(plan.wants).toHaveLength(1);
  });
});

describe("price memo", () => {
  beforeEach(() => __clearPriceMemo());

  it("expires a quote after 60s but keeps a NAV for a day", () => {
    const t0 = 1_000_000;
    writeMemo(cacheKey("yahoo", "INFY.NS"), 1500, t0);
    writeMemo(cacheKey("mf", "122639"), 82.4, t0);

    const quote = (at: number) => readMemo("yahoo:INFY.NS", "yahoo", at);
    const nav = (at: number) => readMemo("mf:122639", "mf", at);

    expect(quote(t0 + 59_000)).toBe(1500);
    expect(quote(t0 + 61_000)).toBeNull();

    expect(nav(t0 + 60_000)).toBe(82.4);
    expect(nav(t0 + 23 * 3600_000)).toBe(82.4);
    expect(nav(t0 + 25 * 3600_000)).toBeNull();
  });

  it("misses on a symbol it has never seen", () => {
    expect(readMemo("yahoo:NOPE", "yahoo")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The hook. These are the BUG-044 regression tests: one request for the whole
// portfolio, and no requests at all while the tab is hidden.
// ---------------------------------------------------------------------------

describe("useLivePrices", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let visibility: DocumentVisibilityState;

  const setVisibility = (v: DocumentVisibilityState) => {
    visibility = v;
    document.dispatchEvent(new Event("visibilitychange"));
  };

  beforeEach(() => {
    __clearPriceMemo();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);

    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const prices: Record<string, number> = {};
      for (const s of body.symbols ?? []) prices[`${s.provider}:${s.symbol}`] = 100;
      return { ok: true, json: async () => ({ prices }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const portfolio = [
    rec("a", "stocks", { ticker: "NSE:RELIANCE", quantity: "10" }),
    rec("b", "stocks", { ticker: "NSE:RELIANCE", quantity: "5" }),
    rec("c", "stocks", { ticker: "NSE:INFY", quantity: "3" }),
    rec("d", "mutual_funds", { scheme: "Parag Parikh 122639", units: "12" }),
  ];

  it("prices the whole portfolio in ONE request, with deduped symbols", async () => {
    renderHook(() => useLivePrices(portfolio));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/functions/v1/live-price");
    expect(init?.method).toBe("POST");
    // 4 holdings, 3 unique symbols — RELIANCE is held twice.
    expect(JSON.parse(String(init?.body)).symbols).toEqual([
      { provider: "yahoo", symbol: "RELIANCE.NS" },
      { provider: "yahoo", symbol: "INFY.NS" },
      { provider: "mf", symbol: "122639" },
    ]);
  });

  it("applies one fetched price to every holding of that symbol", async () => {
    const { result } = renderHook(() => useLivePrices(portfolio));
    await waitFor(() => expect(result.current.live.a?.unitPrice).toBe(100));

    expect(result.current.live.b.unitPrice).toBe(100);
    expect(result.current.live.a.currentValue).toBe(1000); // 100 × 10
    expect(result.current.live.b.currentValue).toBe(500); //  100 × 5
  });

  it("does NOT poll while the tab is hidden, and catches up on return", async () => {
    renderHook(() => useLivePrices(portfolio, 60_000));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => setVisibility("hidden"));
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    // Five intervals elapsed in the background and cost nothing.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("keeps polling on the interval while visible", async () => {
    renderHook(() => useLivePrices(portfolio, 60_000));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("stops polling once unmounted", async () => {
    const { unmount } = renderHook(() => useLivePrices(portfolio, 60_000));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves a remount from the memo instead of refetching", async () => {
    const first = renderHook(() => useLivePrices(portfolio));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = renderHook(() => useLivePrices(portfolio));
    await waitFor(() => expect(second.result.current.live.a?.unitPrice).toBe(100));
    // Still inside the 60s TTL, so no second network call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the stored value when the price is unavailable", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ prices: { "yahoo:RELIANCE.NS": null } }),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useLivePrices([rec("a", "stocks", { ticker: "NSE:RELIANCE", quantity: "10", current_price: "1250" })]),
    );

    await waitFor(() => expect(result.current.live.a).toBeDefined());
    expect(result.current.live.a.unitPrice).toBe(1250);
  });

  it("makes no request at all for a portfolio with nothing live in it", async () => {
    renderHook(() => useLivePrices([rec("a", "fd", { bank: "HDFC" }), rec("b", "gold", {})]));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cacheKey", () => {
  it("is stable and provider-scoped", () => {
    const p: Provider = "yahoo";
    expect(cacheKey(p, "INFY.NS")).toBe("yahoo:INFY.NS");
    expect(cacheKey("mf", "122639")).toBe("mf:122639");
  });
});
