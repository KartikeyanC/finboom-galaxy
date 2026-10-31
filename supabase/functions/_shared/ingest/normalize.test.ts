import { describe, it, expect, vi } from "vitest";
import {
  IngestValidationError,
  canonicalDedupKey,
  computeRawPayloadHash,
  dedupeBatch,
  ingestNormalized,
  normalizeIngest,
  normalizeLast4,
  normalizeType,
  parseAmount,
  parseOccurredAt,
  toIngestRpcArgs,
  utcMinute,
  type RawIngestTxn,
} from "./normalize";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-10-31T09:00:00Z");

const sms = (over: Partial<RawIngestTxn> = {}): RawIngestTxn => ({
  source: "sms",
  tenantId: TENANT,
  userId: USER,
  type: "debited",
  amount: "Rs. 1,234.50",
  // 14:05:42 IST — the same minute as 08:35 UTC.
  occurredAt: "2026-10-31T14:05:42+05:30",
  account: "A/c XX5678",
  merchant: "SWIGGY",
  ...over,
});

describe("normalizeType", () => {
  it.each(["debit", "DR", "Debited", "spent", "paid", "expense", "withdrawn"])(
    "%s is an expense",
    (w) => expect(normalizeType(w)).toBe("expense"),
  );
  it.each(["credit", "CR", "credited", "received", "income", "refund"])(
    "%s is income",
    (w) => expect(normalizeType(w)).toBe("income"),
  );
  it("refuses words it does not know rather than guessing", () => {
    expect(() => normalizeType("transfer")).toThrow(IngestValidationError);
    expect(() => normalizeType("payment")).toThrow(IngestValidationError);
  });
});

describe("parseAmount", () => {
  it.each([
    ["Rs. 1,234.50", 1234.5],
    ["INR 1234.5", 1234.5],
    ["₹1,00,000", 100000],
    ["₹499/-", 499],
    ["rs.20", 20],
    [12.345, 12.35],
  ])("%s → %d", (raw, want) => expect(parseAmount(raw)).toBe(want));

  it.each(["", "abc", "-50", "0", "1.2.3", "Rs."])("rejects %j", (raw) => {
    expect(() => parseAmount(raw)).toThrow(IngestValidationError);
  });

  it("rejects zero, negatives and the absurd", () => {
    expect(() => parseAmount(0)).toThrow();
    expect(() => parseAmount(-1)).toThrow();
    expect(() => parseAmount(1e15)).toThrow();
    expect(() => parseAmount(Number.NaN)).toThrow();
  });
});

describe("normalizeLast4", () => {
  it.each([
    ["A/c no. XXXXXX5678", "5678"],
    ["XX1234", "1234"],
    ["card ending 4321", "4321"],
    ["1234", "1234"],
  ])("%s → %s", (raw, want) => expect(normalizeLast4(raw)).toBe(want));

  it("is null when fewer than four digits are named", () => {
    expect(normalizeLast4("XX12")).toBeNull();
    expect(normalizeLast4(null)).toBeNull();
    expect(normalizeLast4("")).toBeNull();
  });
});

describe("parseOccurredAt", () => {
  it("accepts ISO, epoch milliseconds and Date", () => {
    const want = Date.parse("2026-10-31T08:35:00Z");
    expect(parseOccurredAt("2026-10-31T08:35:00Z", NOW).getTime()).toBe(want);
    expect(parseOccurredAt(want, NOW).getTime()).toBe(want);
    expect(parseOccurredAt(new Date(want), NOW).getTime()).toBe(want);
  });

  it("allows a phone clock a few minutes fast, not more", () => {
    expect(() => parseOccurredAt("2026-10-31T09:05:00Z", NOW)).not.toThrow();
    expect(() => parseOccurredAt("2026-10-31T09:30:00Z", NOW)).toThrow(IngestValidationError);
  });

  it("rejects nonsense", () => {
    expect(() => parseOccurredAt("yesterday", NOW)).toThrow(IngestValidationError);
  });
});

describe("the de-dup key — the contract with the Dart twin", () => {
  it("buckets to the UTC minute", () => {
    expect(utcMinute(new Date("2026-10-31T14:05:59.999+05:30"))).toBe("2026-10-31T08:35Z");
  });

  // If either vector changes, every ingested row is re-keyed: change the
  // mobile app's copy in the same commit.
  it("vector 1: with an account", async () => {
    const k = {
      userId: USER,
      amount: 1234.5,
      type: "expense" as const,
      occurredAt: new Date("2026-10-31T08:35:42Z"),
      accountLast4: "5678",
    };
    expect(canonicalDedupKey(k)).toBe(`${USER}|1234.50|expense|2026-10-31T08:35Z|5678`);
    expect(await computeRawPayloadHash(k)).toBe(
      "8122132376b4f00cb39781ee7617a5dcfb7971a74b5959fb6b532f906447ddf3",
    );
  });

  it("vector 2: no account is an empty field, not 'null'", async () => {
    const k = {
      userId: USER,
      amount: 500,
      type: "income" as const,
      occurredAt: new Date("2026-10-31T08:35:00Z"),
      accountLast4: null,
    };
    expect(canonicalDedupKey(k)).toBe(`${USER}|500.00|income|2026-10-31T08:35Z|`);
    expect(await computeRawPayloadHash(k)).toBe(
      "a3f238c645f1152e3d80a3f752f35d265abb91aaf560f2385f3706b805287142",
    );
  });
});

describe("normalizeIngest", () => {
  it("normalises an Indian bank SMS", async () => {
    const n = await normalizeIngest(sms(), NOW);
    expect(n).toMatchObject({
      source: "sms",
      type: "expense",
      amount: 1234.5,
      currency: "INR",
      occurredAt: "2026-10-31T08:35:42.000Z",
      accountLast4: "5678",
      category: "Other",
      description: "SWIGGY",
      externalRef: null,
    });
    expect(n.rawPayloadHash).toBe(
      "8122132376b4f00cb39781ee7617a5dcfb7971a74b5959fb6b532f906447ddf3",
    );
  });

  it("the same payment from SMS, notification and e-mail hashes identically", async () => {
    const a = await normalizeIngest(sms(), NOW);
    const b = await normalizeIngest(
      sms({ source: "notification", type: "paid", amount: 1234.5, account: "XX5678", merchant: "Swiggy" }),
      NOW,
    );
    const c = await normalizeIngest(
      sms({ source: "email", type: "DR", amount: "INR 1,234.50", occurredAt: "2026-10-31T08:35:05Z" }),
      NOW,
    );
    expect(b.rawPayloadHash).toBe(a.rawPayloadHash);
    expect(c.rawPayloadHash).toBe(a.rawPayloadHash);
  });

  it("a different minute, amount, direction or account is a different payment", async () => {
    const base = (await normalizeIngest(sms(), NOW)).rawPayloadHash;
    const variants = [
      sms({ occurredAt: "2026-10-31T14:06:00+05:30" }),
      sms({ amount: "1234.51" }),
      sms({ type: "credited" }),
      sms({ account: "XX9999" }),
      sms({ userId: "33333333-3333-3333-3333-333333333333" }),
    ];
    for (const v of variants) {
      expect((await normalizeIngest(v, NOW)).rawPayloadHash).not.toBe(base);
    }
  });

  it("merchant and note do not change the hash (sources word them differently)", async () => {
    const a = await normalizeIngest(sms(), NOW);
    const b = await normalizeIngest(sms({ merchant: "Swiggy Instamart", note: "UPI" }), NOW);
    expect(b.rawPayloadHash).toBe(a.rawPayloadHash);
    expect(b.description).toBe("Swiggy Instamart · UPI");
  });

  it("rejects payloads that would write nonsense", async () => {
    await expect(normalizeIngest(sms({ source: "fax" }), NOW)).rejects.toThrow(/source/i);
    await expect(normalizeIngest(sms({ tenantId: "nope" }), NOW)).rejects.toThrow(/tenantId/);
    await expect(normalizeIngest(sms({ userId: "" }), NOW)).rejects.toThrow(/userId/);
    await expect(normalizeIngest(sms({ currency: "RUPEES" }), NOW)).rejects.toThrow(/currency/i);
    await expect(normalizeIngest(sms({ amount: "-10" }), NOW)).rejects.toThrow(IngestValidationError);
  });

  it("trims and caps free text", async () => {
    const n = await normalizeIngest(
      sms({ merchant: `  ${"A".repeat(500)}  `, externalRef: "  RRN 123  ", note: null }),
      NOW,
    );
    expect(n.description).toHaveLength(120);
    expect(n.externalRef).toBe("RRN 123");
  });
});

describe("dedupeBatch", () => {
  it("drops repeats inside one batch", async () => {
    const a = await normalizeIngest(sms(), NOW);
    const b = await normalizeIngest(sms({ source: "email" }), NOW);
    const c = await normalizeIngest(sms({ amount: 99 }), NOW);
    const { rows, duplicatesInBatch } = dedupeBatch([a, b, c]);
    expect(rows).toEqual([a, c]);
    expect(duplicatesInBatch).toBe(1);
  });
});

describe("ingestNormalized", () => {
  it("passes exactly the RPC's named arguments", async () => {
    const n = await normalizeIngest(sms({ externalRef: "RRN1", paymentMode: "UPI" }), NOW);
    expect(Object.keys(toIngestRpcArgs(n)).sort()).toEqual(
      [
        "p_account_last4", "p_amount", "p_category", "p_currency", "p_description",
        "p_external_ref", "p_occurred_at", "p_payment_mode", "p_raw_payload_hash",
        "p_source", "p_tenant_id", "p_type", "p_user_id",
      ],
    );
  });

  it("reports inserted vs duplicate from the RPC's row", async () => {
    const n = await normalizeIngest(sms(), NOW);
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ transaction_id: "t1", outcome: "inserted" }], error: null })
      .mockResolvedValueOnce({ data: [{ transaction_id: "t1", outcome: "duplicate" }], error: null });
    const client = { rpc };

    expect(await ingestNormalized(client, n)).toEqual({
      rawPayloadHash: n.rawPayloadHash,
      outcome: "inserted",
      transactionId: "t1",
    });
    expect((await ingestNormalized(client, n)).outcome).toBe("duplicate");
    expect(rpc).toHaveBeenCalledWith("ingest_transaction", toIngestRpcArgs(n));
  });

  it("throws on an RPC error instead of reporting success", async () => {
    const n = await normalizeIngest(sms(), NOW);
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "not allowed", code: "42501" } }),
    };
    await expect(ingestNormalized(client, n)).rejects.toThrow(/not allowed/);
  });
});
