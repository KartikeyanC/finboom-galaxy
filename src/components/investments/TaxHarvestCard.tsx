import { useMemo } from "react";
import { Leaf } from "lucide-react";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { useTenantSetting } from "@/hooks/useTenantSetting";
import type { InvestmentRecord } from "@/lib/investmentsStore";
import { useLivePrices } from "@/lib/livePrices";
import { money2, qty2 } from "@/lib/holdingFigures";
import { financialYear, LTCG_EXEMPTION, planHarvest } from "@/lib/taxHarvest";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Tax harvesting for this financial year: how much of the ₹1.25 L long-term
 * exemption is left, and which units to sell (oldest first) to use it. The
 * figures come from taxHarvest.ts; this only lays them out.
 */
export default function TaxHarvestCard({ records }: { records: InvestmentRecord[] }) {
  const { live } = useLivePrices(records);
  const { value: bookedByYear, setValue: setBookedByYear } = useTenantSetting("ltcg_booked");

  const plan = useMemo(() => {
    const livePrice = Object.fromEntries(Object.entries(live).map(([id, t]) => [id, t.unitPrice]));
    const today = new Date();
    const { fy } = financialYear(today);
    return planHarvest({ records, livePrice, booked: bookedByYear[fy] ?? 0, today });
  }, [records, live, bookedByYear]);

  const selling = plan.holdings.filter((h) => h.sell.units > 0);
  const others = plan.holdings.filter((h) => h.sell.units === 0);
  const fyEnd = day(plan.fyEnd);

  return (
    <section className="rounded-xl border border-border bg-card/60 text-foreground backdrop-blur-sm">
      <header className="flex flex-wrap items-start justify-between gap-4 p-5 border-b border-border">
        <div className="max-w-xl">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Leaf className="h-4 w-4 text-primary" aria-hidden />
            Tax harvesting · FY {plan.fy}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Long-term gains on Indian shares and equity funds are tax-free up to{" "}
            {money2(LTCG_EXEMPTION)} a year. Booking them before {fyEnd} and buying back raises your
            cost, so that gain is never taxed later.
          </p>
        </div>
        <div className="w-full sm:w-56 space-y-1.5">
          <Label htmlFor="ltcg-booked" className="text-xs text-muted-foreground">
            Already booked this year
          </Label>
          <MoneyInput
            id="ltcg-booked"
            placeholder="0"
            value={plan.booked || ""}
            onValueChange={(v) => setBookedByYear({ ...bookedByYear, [plan.fy]: v ?? 0 })}
          />
        </div>
      </header>

      <dl className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
        {[
          ["Exemption left", money2(plan.remaining)],
          ["This plan books", money2(plan.planned)],
          ["Tax saved later", `≈ ${money2(plan.taxSaved)}`],
        ].map(([k, v]) => (
          <div key={k} className="px-3 py-4">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className="mt-1 font-semibold tabular-nums whitespace-nowrap text-sm sm:text-base">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="p-5 space-y-5">
        {selling.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Sell these, then buy them back</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {selling.map((h) => {
                const held = h.lots.reduce((s, l) => s + l.qty, 0);
                return (
                  <li key={h.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{h.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Sell {qty2(h.sell.units)} of {qty2(held)} {h.asset === "stocks" ? "shares" : "units"}
                        {" · "}oldest first{h.broker ? ` · ${h.broker}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold tabular-nums text-success whitespace-nowrap">
                        +{money2(h.sell.gain)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        for {money2(h.sell.value)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Shares: sell, then buy back the next trading day — a same-day buy-back counts as
              intraday. Funds: redeem, then invest the money again once it arrives.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {plan.remaining <= 0
              ? `This year's exemption is used up. The next one starts on 1 Apr ${plan.fyEnd.slice(0, 4)}.`
              : plan.holdings.length
                ? "Your long-term holdings have no gain to book right now."
                : "No long-term equity holdings yet — units held more than 12 months show here."}
          </p>
        )}

        {others.length > 0 && selling.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Also long-term, not needed for this plan: {others.map((h) => h.name).join(", ")}.
          </p>
        )}

        {plan.upcoming.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Turning long-term before {fyEnd}</h3>
            <ul className="space-y-2 text-sm">
              {plan.upcoming.map((u) => (
                <li key={`${u.name}|${u.date}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {qty2(u.units)} units on {day(u.date)}
                    </p>
                  </div>
                  <span className="tabular-nums text-success whitespace-nowrap">+{money2(u.gain)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(plan.skipped.length > 0 || plan.undated.length > 0) && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Left out or estimated</summary>
            <ul className="mt-2 space-y-1">
              {plan.undated.map((name) => (
                <li key={`u-${name}`}>
                  <span className="text-foreground">{name}</span> — no buy date, so it counts from the day
                  it was added. Edit it and add the buy date.
                </li>
              ))}
              {plan.skipped.map((s, i) => (
                <li key={`s-${i}`}>
                  <span className="text-foreground">{s.name}</span> — {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-[11px] text-muted-foreground">
          An estimate from your saved holdings, not tax advice. Exit loads, STT and charges aren't
          included; check with your tax adviser before selling.
        </p>
      </div>
    </section>
  );
}
