import { describe, expect, it } from "vitest";
import { findAmount, findDate, findDirection, parseSmsText } from "./smsParser";

const TODAY = new Date(2026, 9, 31);

describe("findAmount", () => {
  it("reads comma-grouped rupee amounts", () => {
    expect(findAmount("Rs.1,250.50 debited")).toBe(1250.5);
    expect(findAmount("INR 500 spent")).toBe(500);
    expect(findAmount("₹99 paid")).toBe(99);
  });
  it("ignores balances and limits", () => {
    expect(findAmount("Avl Bal Rs 12,000. Rs 300 debited")).toBe(300);
  });
});

describe("findDate", () => {
  it("handles the common bank formats", () => {
    expect(findDate("on 12-10-24")).toBe("2024-10-12");
    expect(findDate("on 12/10/2024")).toBe("2024-10-12");
    expect(findDate("on 12-Oct-24")).toBe("2024-10-12");
    expect(findDate("on 2024-10-12")).toBe("2024-10-12");
  });
  it("rejects impossible dates", () => {
    expect(findDate("on 31-02-24")).toBeNull();
  });
});

describe("findDirection", () => {
  it("treats a credit card spend as an expense", () => {
    expect(findDirection("Rs 500 spent on HDFC Credit Card XX1234")).toBe("expense");
  });
  it("uses the first keyword for transfers", () => {
    expect(findDirection("debited for Rs 500 and credited to a/c 9999")).toBe("expense");
  });
});

describe("parseSmsText", () => {
  it("parses a UPI debit", () => {
    const r = parseSmsText(
      "Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 12/10/24 Ref 4567890",
      TODAY,
    );
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({
      type: "expense",
      amount: 250,
      date: "2024-10-12",
      merchant: "SWIGGY",
      category: "Food & Dining",
      account: "1234",
    });
  });

  it("parses a salary credit", () => {
    const r = parseSmsText(
      "Dear Customer, A/c XX4321 credited with Rs. 85,000.00 on 01-Oct-24 by ACME PAYROLL salary. Avl Bal Rs 90,000",
      TODAY,
    );
    expect(r.drafts[0]).toMatchObject({ type: "income", amount: 85000, date: "2024-10-01" });
  });

  it("falls back to today when the message has no date", () => {
    const r = parseSmsText("Rs 100 debited from A/c XX1111 at UBER", TODAY);
    expect(r.drafts[0].date).toBe("2026-10-31");
    expect(r.drafts[0].category).toBe("Transport");
  });

  it("splits several messages and skips noise", () => {
    const r = parseSmsText(
      "Rs 100 debited from A/c XX1111 at UBER on 01-10-24\n\n123456 is your OTP. Do not share.\n\nINR 2,000 credited to A/c XX1111 on 02-10-24",
      TODAY,
    );
    expect(r.drafts).toHaveLength(2);
    expect(r.skipped).toHaveLength(1);
  });

  it("reports text it cannot read instead of guessing", () => {
    const r = parseSmsText("Hello, your statement is ready", TODAY);
    expect(r.drafts).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
  });
});
