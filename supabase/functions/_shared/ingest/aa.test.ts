import { describe, it, expect } from "vitest";
import {
  collectFiTransactions,
  externalRefOf,
  fiPayloadToRawIngest,
  merchantFromNarration,
  occurredAtOf,
  paymentModeOf,
} from "./aa";
import { normalizeIngest } from "./normalize";

const WHO = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
};

// Invented figures in the ReBIT deposit-account shape.
const debit = {
  txnId: "M8812345",
  type: "DEBIT",
  mode: "UPI",
  amount: "1234.50",
  currentBalance: "50210.00",
  transactionTimestamp: "2026-10-31T14:05:42+05:30",
  valueDate: "2026-10-31",
  narration: "UPI/430412345678/SWIGGY/swiggy@icici/Payment",
  reference: "430412345678",
};
const credit = {
  txnId: "M8812399",
  type: "CREDIT",
  mode: "NEFT",
  amount: 25000,
  transactionTimestamp: "2026-10-31T10:15:42+05:30",
  narration: "NEFT-ACME CORP-N123456789",
  reference: "N123456789",
};

// Setu-style wrapper.
const setuSession = {
  id: "sess-1",
  status: "COMPLETED",
  fips: [
    {
      fipID: "HDFC-FIP",
      accounts: [
        {
          linkRefNumber: "lr-1",
          maskedAccNumber: "XXXXXXXX5678",
          FIstatus: "READY",
          data: {
            account: {
              type: "deposit",
              maskedAccNumber: "XXXXXXXX5678",
              transactions: { startDate: "2026-10-01", endDate: "2026-10-31", transaction: [debit, credit] },
            },
          },
        },
      ],
    },
  ],
};

// A different wrapper, capitalised keys, a second account.
const otherVendor = {
  fipId: "SBI-FIP",
  data: [
    {
      decryptedFI: {
        Account: {
          maskedAccNumber: "XXXX9012",
          Transactions: {
            Transaction: [{ ...credit, txnId: "S1", reference: "", narration: "IMPS-RAVI KUMAR-430411112222" }],
          },
        },
      },
    },
  ],
};

describe("collectFiTransactions", () => {
  it("finds transactions under Setu's wrapper with their account", () => {
    const found = collectFiTransactions(setuSession);
    expect(found).toHaveLength(2);
    expect(found.every((f) => f.maskedAccNumber === "XXXXXXXX5678")).toBe(true);
    expect(found[0].txn.txnId).toBe("M8812345");
  });

  it("finds them under another wrapper with capitalised keys", () => {
    const found = collectFiTransactions(otherVendor);
    expect(found).toHaveLength(1);
    expect(found[0].maskedAccNumber).toBe("XXXX9012");
  });

  it("ignores summaries and profile blocks that are not DEBIT / CREDIT rows", () => {
    expect(
      collectFiTransactions({ account: { summary: { currentBalance: "1", type: "SAVINGS" }, profile: {} } }),
    ).toEqual([]);
  });

  it("does not recurse forever into a hostile payload", () => {
    let deep: Record<string, unknown> = { ...debit };
    for (let i = 0; i < 50; i++) deep = { next: deep };
    expect(collectFiTransactions(deep)).toEqual([]);
  });
});

describe("field mapping", () => {
  it.each([
    ["UPI", "UPI"],
    ["card", "Card"],
    ["ATM", "Cash"],
    ["NEFT", "Net Banking"],
    ["IMPS", "Net Banking"],
    ["CHEQUE", "Cheque"],
    ["OTHERS", null],
    [undefined, null],
  ])("mode %s → %s", (mode, want) => expect(paymentModeOf(mode)).toBe(want));

  it("prefers the 12-digit RRN, from the reference or the narration", () => {
    expect(externalRefOf(debit)).toBe("430412345678");
    expect(externalRefOf({ reference: "", narration: "IMPS-RAVI KUMAR-430411112222" })).toBe("430411112222");
    expect(externalRefOf({ reference: "N123456789", narration: "NEFT-ACME CORP-N123456789" })).toBe("N123456789");
    expect(externalRefOf({})).toBeNull();
  });

  it.each([
    ["UPI/430412345678/SWIGGY/swiggy@icici/Payment", "SWIGGY"],
    ["UPI-ZOMATO LTD-ZOMATO@HDFCBANK-HDFC0000001-430498765432-PAY", "ZOMATO LTD"],
    ["NEFT-ACME CORP-N123456789", "ACME CORP"],
    ["430412345678", null],
    [undefined, null],
  ])("narration %s → %s", (n, want) => expect(merchantFromNarration(n)).toBe(want));

  it("falls back to the value date at IST midnight", () => {
    expect(occurredAtOf({ valueDate: "2026-10-31" })).toBe("2026-10-31T00:00:00+05:30");
    expect(occurredAtOf({ valueDate: "31/10/2026" })).toBeNull();
  });
});

describe("fiPayloadToRawIngest → normalizeIngest", () => {
  it("produces rows the shared normaliser accepts", async () => {
    const { rows, skipped } = fiPayloadToRawIngest(setuSession, WHO);
    expect(skipped).toBe(0);
    const now = new Date("2026-10-31T12:00:00Z");
    const [d, c] = await Promise.all(rows.map((r) => normalizeIngest(r, now)));
    expect(d).toMatchObject({
      source: "aa",
      type: "expense",
      amount: 1234.5,
      accountLast4: "5678",
      description: "SWIGGY",
      externalRef: "430412345678",
      paymentMode: "UPI",
    });
    expect(c).toMatchObject({ type: "income", amount: 25000, paymentMode: "Net Banking" });
  });

  it("an AA row hashes like the bank SMS for the same payment", async () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const [aa] = fiPayloadToRawIngest(setuSession, WHO).rows;
    const fromAa = await normalizeIngest(aa, now);
    const fromSms = await normalizeIngest(
      {
        source: "sms",
        ...WHO,
        type: "debited",
        amount: "Rs.1,234.50",
        occurredAt: "2026-10-31T14:05:12+05:30",
        account: "A/c XX5678",
      },
      now,
    );
    expect(fromAa.rawPayloadHash).toBe(fromSms.rawPayloadHash);
  });

  it("skips rows with no usable time", () => {
    const { rows, skipped } = fiPayloadToRawIngest(
      { maskedAccNumber: "XX1", transactions: { transaction: [{ type: "DEBIT", amount: "5" }] } },
      WHO,
    );
    expect(rows).toEqual([]);
    expect(skipped).toBe(1);
  });
});
