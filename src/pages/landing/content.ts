import { PieChart, ShieldCheck, Target, TrendingUp, Wallet } from "lucide-react";

/**
 * Landing page copy and catalogues — split out in Stage 4.13.
 *
 * Landing.tsx was 1 414 lines, and a good third of it was prose. Marketing
 * copy changes on a completely different cadence from the animation and layout
 * code it was wedged between, and mixing the two is what made the file
 * unreviewable. Editing the words now means opening this file and nothing else.
 */

/* ═══════════════════════════ content ═══════════════════════════ */
export const NAV = [
  { label: "Product", href: "#product" },
  { label: "Workflow", href: "#workflow" },
  { label: "Voices", href: "#voices" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];
export const STATS = [
  { k: "₹4.2B+", v: "Tracked through FinRoot" },
  { k: "32k", v: "Households onboard" },
  { k: "7", v: "Allocation buckets" },
  { k: "4.9★", v: "App Store & Play" },
];
export const FEATURES = [
  { icon: Wallet, title: "Every rupee, accounted for", body: "Income, expenses, investments — one elegant ledger across 5 currencies. Categorised automatically, owned by you.", span: "md:col-span-3", tall: true },
  { icon: PieChart, title: "7-bucket budget", body: "The proven allocation ritual — Essentials, Wants, Long-term, Insurance, Short-term, Investments, Charity.", span: "md:col-span-3", tall: true },
  { icon: Target, title: "Goals that breathe", body: "Set, pause, resume. Watch progress in real time as paychecks land and SIPs auto-allocate.", span: "md:col-span-2", tall: false },
  { icon: TrendingUp, title: "Investment intelligence", body: "Portfolio value, dividends, interest — distilled from your transactions, refreshed live.", span: "md:col-span-2", tall: false },
  { icon: ShieldCheck, title: "Private by architecture", body: "Row-level security, encrypted at rest. Your numbers are never sold, never mined.", span: "md:col-span-2", tall: false },
];
export const WORKFLOW = [
  { n: "01", t: "Connect & capture", d: "Log income and expenses in seconds, or drop a screenshot — we parse the rest into clean, categorised rows." },
  { n: "02", t: "Allocate by design", d: "Your salary auto-splits into 7 buckets the moment it lands. No spreadsheets. No drift. No second-guessing." },
  { n: "03", t: "Compound calmly", d: "Goals advance silently while a weekly digest tells you exactly where you stand — and what to do next." },
];
export const TESTIMONIALS = [
  { q: "I finally see my money the way I see my calendar — structured, calm, intentional.", a: "Ananya R.", r: "Product Lead, Bengaluru" },
  { q: "The 7-bucket model alone changed how my household talks about money.", a: "Vikram & Priya", r: "Dual-income, Mumbai" },
  { q: "Replaced four spreadsheets, two apps, and a recurring fight at the dinner table.", a: "Dr. Mehta", r: "Pune" },
];
export const FAQ = [
  { q: "Is my financial data safe?", a: "Every row is encrypted at rest, scoped to you with row-level security, and never sold. You can export or delete everything at any time." },
  { q: "Do you support multiple currencies?", a: "Yes — INR, USD, EUR, GBP and AED out of the box, with smart aggregation to your home currency." },
  { q: "Can I cancel anytime?", a: "Yes. Plans are monthly. Cancel in one click — your data stays." },
  { q: "Do you replace my bank?", a: "No. FinRoot sits on top of your accounts as a calm, opinionated lens — not another transactional ledger." },
];
export const BUCKETS = ["Essentials", "Wants", "Long-term", "Insurance", "Short-term", "Investments", "Charity"];
export const MARQUEE = ["Encrypted by default", "7-bucket allocation", "Live investment sync", "Multi-currency", "Bill scanning", "Goal automation", "Weekly digest"];
