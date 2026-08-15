import * as React from "react";
import { Input } from "@/components/ui/input";

/** Strip everything except digits and a single decimal point. */
function sanitize(raw: string): string {
  let s = raw.replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    // keep only the first dot
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return s;
}

/** Format a sanitized "1234.5" string with en-IN grouping → "1,234.5" (keeps a trailing dot while typing). */
function group(sanitized: string): string {
  if (sanitized === "") return "";
  const [intPart, decPart] = sanitized.split(".");
  const intGrouped =
    intPart === "" ? "" : Number(intPart).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (sanitized.includes(".")) {
    return `${intGrouped || "0"}.${(decPart ?? "").slice(0, 2)}`;
  }
  return intGrouped;
}

/** Parse a display string back to a number (or undefined when empty). */
function toNumber(sanitized: string): number | undefined {
  if (sanitized === "" || sanitized === ".") return undefined;
  const n = Number(sanitized);
  return Number.isFinite(n) ? n : undefined;
}

type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  /** Numeric value (or "" / null / undefined for empty). */
  value: number | string | null | undefined;
  /** Called with the parsed number, or undefined when cleared. */
  onValueChange: (value: number | undefined) => void;
};

/**
 * Text input that displays amounts with Indian digit grouping (e.g. 60,000)
 * while reporting the raw number to the parent. Use this for every money field
 * instead of <Input type="number">.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, inputMode = "decimal", ...props }, ref) => {
    // Local display string lets the user type intermediate states (trailing dot, etc.).
    const [display, setDisplay] = React.useState<string>(() =>
      value === "" || value === null || value === undefined ? "" : group(String(value)),
    );

    // Sync when the parent value changes externally (reset, edit-load) and it no
    // longer matches what's shown — without clobbering mid-typing states.
    React.useEffect(() => {
      const shown = toNumber(sanitize(display));
      const incoming =
        value === "" || value === null || value === undefined ? undefined : Number(value);
      if (incoming !== shown) {
        setDisplay(incoming === undefined ? "" : group(String(incoming)));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const shown = group(sanitize(e.target.value));
      setDisplay(shown);
      // Report the number the user can actually see. Parsing the raw input
      // instead would emit 12.3456 while the field showed 12.34 — and since
      // amounts are numeric(14,2), the row would then store 12.35.
      onValueChange(toNumber(sanitize(shown)));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={inputMode}
        value={display}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
MoneyInput.displayName = "MoneyInput";
