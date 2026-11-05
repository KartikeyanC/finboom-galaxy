import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const hourNow = new Date();
hourNow.setUTCMinutes(0, 0, 0);

const db = vi.hoisted(() => ({
  usage: { data: [] as unknown[] | null, error: null as unknown },
  alerts: [] as unknown[],
  limits: null as unknown,
  rpc: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const done = () =>
      table === "edge_usage"
        ? Promise.resolve(db.usage)
        : table === "edge_usage_alerts"
          ? Promise.resolve({ data: db.alerts, error: null })
          : Promise.resolve({ data: db.limits ? { value: db.limits } : null, error: null });
    for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
    chain.gte = done;
    chain.limit = done;
    chain.maybeSingle = done;
    return chain;
  };
  return { supabase: { from, rpc: db.rpc } };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PoEdgeUsage from "./PoEdgeUsage";

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PoEdgeUsage />
    </QueryClientProvider>,
  );

describe("PoEdgeUsage", () => {
  beforeEach(() => {
    db.usage = {
      data: [{ fn: "live-price", hour: hourNow.toISOString(), calls: 150, errors: 4 }],
      error: null,
    };
    db.alerts = [];
    db.limits = { default: { hour: 100 } };
    db.rpc.mockClear();
  });

  it("shows each function against its limit and flags one that is over", async () => {
    show();
    const meter = await screen.findByRole("meter", { name: "live-price use of its limit" });
    expect(meter).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("scan-receipt")).toBeInTheDocument();
    expect(meter.closest("tr")).toHaveClass("text-destructive");
  });

  it("says plainly when the migration is not applied", async () => {
    db.usage = { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
    show();
    expect(await screen.findByRole("status")).toHaveTextContent(/Not switched on yet/);
  });

  it("lists recent alerts", async () => {
    db.alerts = [
      { fn: "po-auth", period: "hour", kind: "calls", limit_value: 100, observed: 101, created_at: "2026-11-05T10:15:00Z" },
    ];
    show();
    expect(await screen.findByText(/passed 100 calls in an hour/)).toBeInTheDocument();
  });

  it("saves the default limits through the audited PO setting", async () => {
    show();
    const perHour = await screen.findByLabelText("Calls / hour");
    await waitFor(() => expect(perHour).toHaveValue("100"));
    fireEvent.change(perHour, { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Error rate %"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));
    await waitFor(() =>
      expect(db.rpc).toHaveBeenCalledWith("po_set_site_setting", {
        p_key: "edge_usage_limits",
        p_value: { default: { hour: 500, day: 20000, error_rate: 0.25 } },
      }),
    );
  });

  it("refuses a limit that is not a whole positive number", async () => {
    show();
    const perDay = await screen.findByLabelText("Calls / day");
    await waitFor(() => expect(screen.getByLabelText("Calls / hour")).toHaveValue("100"));
    fireEvent.change(perDay, { target: { value: "-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
