import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SmsCapture } from "./SmsCapture";

const mutateAsync = vi.fn();
vi.mock("@/hooks/useImportTransactions", () => ({
  useImportTransactions: () => ({ mutateAsync, isPending: false }),
}));

const SAMPLE =
  "Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 12/10/24 Ref 4567890\n\n" +
  "123456 is your OTP. Do not share.\n\n" +
  "INR 85,000 credited to A/c XX1234 on 01-10-24 salary";

function paste(text: string) {
  fireEvent.change(screen.getByLabelText(/messages/i), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /read messages/i }));
}

describe("SmsCapture", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ inserted: 2, skipped: 0, attempted: 2 });
  });

  it("keeps Read disabled until something is pasted", () => {
    render(<SmsCapture />);
    expect(screen.getByRole("button", { name: /read messages/i })).toBeDisabled();
  });

  it("shows drafts for transactions and lists the skipped OTP", () => {
    render(<SmsCapture />);
    paste(SAMPLE);
    expect(screen.getByText(/2 transactions found/i)).toBeInTheDocument();
    expect(screen.getByText("SWIGGY")).toBeInTheDocument();
    expect(screen.getByText(/1 message skipped/i)).toBeInTheDocument();
  });

  it("saves only the rows left after removing one, with noon timestamps", async () => {
    render(<SmsCapture />);
    paste(SAMPLE);
    fireEvent.click(screen.getByRole("button", { name: /remove swiggy/i }));
    fireEvent.click(screen.getByRole("button", { name: /save 1 transaction$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const rows = mutateAsync.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "income", amount: 85000, currency: "INR" });
    expect(rows[0].occurred_at).toMatch(/^2024-10-01T/);
  });

  it("says so when nothing could be read", () => {
    render(<SmsCapture />);
    paste("Hello, your statement is ready");
    expect(screen.getByText(/no transactions found/i)).toBeInTheDocument();
  });
});
