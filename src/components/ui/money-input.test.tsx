import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { MoneyInput } from "./money-input";

/**
 * Test case FIN-007 — the money field must show Indian grouping while typing
 * and hand the parent a plain number. Every amount in the app goes through it,
 * so a regression here corrupts input everywhere at once.
 */

function Harness({ onValue }: { onValue: (v: number | undefined) => void }) {
  const [value, setValue] = useState<number | undefined>(undefined);
  return (
    <MoneyInput
      aria-label="amount"
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

const type = (text: string, spy = vi.fn()) => {
  render(<Harness onValue={spy} />);
  const input = screen.getByLabelText("amount") as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  return { input, spy };
};

describe("MoneyInput (FIN-007)", () => {
  it("groups in lakhs while typing and emits the raw number", () => {
    const { input, spy } = type("150000");
    expect(input.value).toBe("1,50,000");
    expect(spy).toHaveBeenLastCalledWith(150000);
  });

  it("ignores anything that is not a digit or a decimal point", () => {
    const { input, spy } = type("₹1,2a3b4");
    expect(input.value).toBe("1,234");
    expect(spy).toHaveBeenLastCalledWith(1234);
  });

  it("keeps a trailing dot so a decimal can be typed", () => {
    const { input } = type("1234.");
    expect(input.value).toBe("1,234.");
  });

  it("keeps only the first decimal point", () => {
    const { input, spy } = type("12.34.56");
    expect(input.value).toBe("12.34");
    expect(spy).toHaveBeenLastCalledWith(12.34);
  });

  it("caps at two decimal places", () => {
    const { input } = type("99.999");
    expect(input.value).toBe("99.99");
  });

  it("emits exactly what it displays (BUG-076)", () => {
    // The field showed 99.99 but reported 99.999, which numeric(14,2) then
    // stored as 100.00 — a number the user never saw or typed.
    const { spy } = type("99.999");
    expect(spy).toHaveBeenLastCalledWith(99.99);
  });

  it("reports undefined — not zero — when cleared", () => {
    const spy = vi.fn();
    render(<Harness onValue={spy} />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(spy).toHaveBeenLastCalledWith(undefined);
  });

  it("shows a leading zero for a value typed as .5", () => {
    const { input, spy } = type(".5");
    expect(input.value).toBe("0.5");
    expect(spy).toHaveBeenLastCalledWith(0.5);
  });
});
