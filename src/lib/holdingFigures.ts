import { CURRENCY_SYMBOL } from "./finance";
import { getInvested, type InvestmentRecord } from "./investmentsStore";

/**
 * The few figures a holdings row shows, worked out once (pure, tested):
 * quantity and average price for anything bought in units, and money in the
 * broker-list format — always two decimals, so the column lines up.
 */

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Units held: shares, fund units, coins. 0 when the record has no count. */
export function quantityOf(r: InvestmentRecord): number {
  const f = r.fields ?? {};
  switch (r.asset) {
    case "stocks":
    case "crypto":
      return num(f.qty) || num(f.quantity);
    case "mutual_funds":
      return num(f.units);
    default:
      return 0;
  }
}

/** Average buy price per unit — invested ÷ units; 0 when unknown. */
export function averagePriceOf(r: InvestmentRecord): number {
  const q = quantityOf(r);
  return q > 0 ? getInvested(r) / q : 0;
}

/** "₹4,380.00" — Indian grouping for rupees, always two decimals. */
export function money2(amount: number, currency = "INR"): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const sym = CURRENCY_SYMBOL[currency] ?? "";
  const body = Math.abs(n).toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "-" : ""}${sym}${body}`;
}

/** "+₹280.00" / "-₹290.00". */
export const signedMoney2 = (amount: number, currency = "INR") =>
  `${amount >= 0 ? "+" : ""}${money2(amount, currency)}`;

/** "+6.83%" / "-5.92%"; "—" when nothing was invested. */
export const signedPct2 = (gain: number, invested: number) => {
  if (invested <= 0) return "—";
  const p = (gain / invested) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
};

/** "10" / "412.35" — whole counts without decimals. */
export const qty2 = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toLocaleString("en-IN", { maximumFractionDigits: 4 });
