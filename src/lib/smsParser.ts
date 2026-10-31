/**
 * Turns pasted bank / UPI SMS text into draft transactions.
 *
 * Nothing here reads a phone: the user pastes messages and reviews every draft
 * before it is saved. That keeps the feature inside the browser, needs no SMS
 * permission, and means a wrong guess costs one click, not a wrong balance.
 *
 * The patterns cover the common Indian bank formats ("Rs.500 debited from A/c
 * XX1234...", "Sent Rs.250 From ... To SWIGGY...", "INR 1,250 spent on ... Card
 * at AMAZON...", "credited with Rs..."). Anything it cannot read confidently is
 * returned as skipped, with a reason, rather than guessed.
 */
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance";

export interface SmsDraft {
  id: string;
  type: "expense" | "income";
  amount: number;
  currency: "INR";
  /** yyyy-mm-dd */
  date: string;
  merchant: string;
  category: string;
  /** Last digits of the account or card, when the message carries them. */
  account?: string;
  raw: string;
}

export interface SmsSkipped {
  raw: string;
  reason: string;
}

export interface SmsParseResult {
  drafts: SmsDraft[];
  skipped: SmsSkipped[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function toIsoDate(d: number, m: number, y: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  if (m < 1 || m > 12 || d < 1 || d > 31 || year < 2000 || year > 2100) return null;
  const check = new Date(year, m - 1, d);
  if (check.getMonth() !== m - 1) return null;
  return `${year}-${pad(m)}-${pad(d)}`;
}

/** First date found in the text, or null. */
export function findDate(text: string): string | null {
  let m = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) return toIsoDate(+m[3], +m[2], +m[1]);
  m = text.match(/\b(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*[-/ ,]*(\d{2,4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return toIsoDate(+m[1], MONTHS[m[2].toLowerCase()], +m[3]);
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) return toIsoDate(+m[1], +m[2], +m[3]);
  return null;
}

/**
 * The transaction amount: the first rupee figure that is not a balance or a
 * limit ("Avl Bal Rs 12,000" must never become the amount).
 */
export function findAmount(text: string): number | null {
  const re = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 28), m.index).toLowerCase();
    if (/(bal|balance|avl|available|limit|outstanding)[^.]{0,20}$/.test(before)) continue;
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

const DEBIT = /\b(debited|debit|spent|paid|sent|withdrawn|purchase|purchased|txn of)\b/i;
const CREDIT = /\b(credited|credit|received|deposited|refund(?:ed)?)\b/i;

/** Which way the money moved, using whichever keyword comes first. */
export function findDirection(text: string): "expense" | "income" | null {
  // "credit card" / "credit limit" are not a credit to the account.
  const t = text.replace(/credit\s*(card|limit)/gi, "card");
  const d = t.search(DEBIT);
  const c = t.search(CREDIT);
  if (d === -1 && c === -1) return null;
  if (d === -1) return "income";
  if (c === -1) return "expense";
  return d < c ? "expense" : "income";
}

export function findAccount(text: string): string | undefined {
  const m = text.match(/(?:a\/c|acct?|account|card|ending)[^\d]{0,12}(?:x+|\*+)?\s*(\d{3,4})\b/i);
  return m?.[1];
}

const STOP = /\s+(?:on|ref|upi|via|avl|bal|balance|using|from|dated|date|utr|txn|if|not|call)(?=\s|$)/i;

export function findMerchant(text: string): string {
  const flat = text.replace(/\s+/g, " ");
  const upi = flat.match(/UPI\/(?:[A-Z]+\/)?\d+\/([A-Za-z0-9 &._@-]{2,40})/);
  const cand =
    upi?.[1] ??
    flat.match(/\b(?:to|at|towards|info:?|merchant:?|vpa)\s+([A-Za-z0-9@][A-Za-z0-9 &._@'-]{1,40})/i)?.[1] ??
    flat.match(/\bby\s+([A-Za-z][A-Za-z0-9 &._@'-]{1,40})/i)?.[1] ??
    "";
  const cut = cand.split(STOP)[0].replace(/[.\s-]+$/g, "").trim();
  return cut.slice(0, 40);
}

const CATEGORY_HINTS: [RegExp, (typeof EXPENSE_CATEGORIES)[number]][] = [
  [/swiggy|zomato|restaurant|cafe|coffee|pizza|burger|dominos|kfc|mcdonald|bakery|food|dining|starbucks|eatery/i, "Food & Dining"],
  [/uber|ola\b|rapido|metro|irctc|fuel|petrol|diesel|hpcl|bpcl|iocl|fastag|parking|redbus|railway/i, "Transport"],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|mall|mart|store|bigbasket|blinkit|zepto|dmart|instamart/i, "Shopping"],
  [/pharma|apollo|hospital|clinic|medic|1mg|netmeds|health|diagnostic|lab\b/i, "Healthcare"],
  [/school|college|tuition|course|udemy|byju|unacademy|fees?\b|university/i, "Education"],
  [/makemytrip|goibibo|airline|indigo|air india|vistara|hotel|oyo|airbnb|booking/i, "Travel"],
  [/netflix|spotify|prime|hotstar|youtube|subscription|icloud|google one|disney|sonyliv|zee5/i, "Subscriptions"],
  [/electric|bescom|msedcl|tneb|water|gas|broadband|airtel|jio|vodafone|vi\b|bsnl|recharge|dth|tata ?power|bill/i, "Utilities"],
  [/rent|landlord|nobroker|housing/i, "Rent"],
  [/salon|spa\b|parlour|beauty|grooming|barber/i, "Personal Care"],
  [/bookmyshow|pvr|inox|cinema|movie|game|steam|dream11/i, "Entertainment"],
];

export function guessCategory(type: "expense" | "income", merchant: string, text: string): string {
  if (type === "income") {
    if (/salary|payroll/i.test(text)) return INCOME_CATEGORIES[0];
    if (/dividend/i.test(text)) return "Dividend";
    if (/interest/i.test(text)) return "Interest";
    return "Other";
  }
  const hay = `${merchant} ${text}`;
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(hay)) return cat;
  return "Other";
}

/** Not money movement: one-time codes, promotions, reminders, statements. */
const NOISE =
  /\b(otp|one[- ]time password|verification code|do not share|offer|apply now|click (?:here|link)|reward points|e-?statement|min(?:imum)? amount due|due date)\b/i;

export function splitMessages(input: string): string[] {
  const text = input.replace(/\r/g, "").trim();
  if (!text) return [];
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  // A single block: one message per line if several lines each carry an amount.
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const withAmount = lines.filter((l) => findAmount(l) !== null);
  return withAmount.length > 1 ? lines : [text.replace(/\s*\n\s*/g, " ")];
}

export function parseSmsText(input: string, today: Date = new Date()): SmsParseResult {
  const drafts: SmsDraft[] = [];
  const skipped: SmsSkipped[] = [];
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  splitMessages(input).forEach((raw, i) => {
    if (NOISE.test(raw) && !/\b(debited|credited|spent)\b/i.test(raw)) {
      skipped.push({ raw, reason: "Not a transaction (OTP, offer or reminder)" });
      return;
    }
    const type = findDirection(raw);
    if (!type) {
      skipped.push({ raw, reason: "No debit or credit found" });
      return;
    }
    const amount = findAmount(raw);
    if (amount === null) {
      skipped.push({ raw, reason: "No amount found" });
      return;
    }
    const merchant = findMerchant(raw);
    drafts.push({
      id: `sms-${i}`,
      type,
      amount,
      currency: "INR",
      date: findDate(raw) ?? todayIso,
      merchant,
      category: guessCategory(type, merchant, raw),
      account: findAccount(raw),
      raw,
    });
  });

  return { drafts, skipped };
}
