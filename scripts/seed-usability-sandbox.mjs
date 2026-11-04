#!/usr/bin/env node
/**
 * Usability-test sandbox seed.
 *
 * Fills ONE test login's workspace with believable sample data so the 13
 * usability tasks in research/usability-test-plan.md start from the same place
 * for every participant: positive net worth, three months of spending, a budget
 * for the current month, one insurance policy, one goal.
 *
 *   node scripts/seed-usability-sandbox.mjs                      # dry run: prints the plan, touches nothing
 *   SEED_EMAIL=.. SEED_PASSWORD=.. node scripts/seed-usability-sandbox.mjs \
 *        --apply --confirm-project <project-ref>                 # write
 *   SEED_EMAIL=.. SEED_PASSWORD=.. node scripts/seed-usability-sandbox.mjs \
 *        --clean --confirm-project <project-ref>                 # remove what --apply wrote
 *
 * Safety, in the order it matters:
 *  - Dry run is the default. Writing needs --apply AND --confirm-project, and the
 *    ref you type must match the project in .env.development.
 *  - It signs in as the test user with the anon key, so RLS applies exactly as in
 *    the app. No service-role key is used or needed.
 *  - It refuses to write if the workspace already has transactions (it would be
 *    mixing fake data into someone's real records). --allow-nonempty overrides.
 *  - Credentials come from the environment only, never from a file or argument.
 *  - Every row it creates is recorded in scripts/.usability-seed-ids.json; --clean
 *    deletes only those ids. Rows a participant creates during a session are NOT
 *    tracked: use a fresh test login (or workspace) per participant and re-seed.
 *
 * Deliberately NOT seeded, because tasks ask the participant to create them:
 *  a trip/savings goal (task 4), a car-insurance policy or reminder (task 5),
 *  a tracker (task 9), workspace members (task 6). Investments are left empty.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IDS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), ".usability-seed-ids.json");
const TAG = "[usability-seed]";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = flag("--apply");
const CLEAN = flag("--clean");
const ALLOW_NONEMPTY = flag("--allow-nonempty");
const CONFIRM = opt("--confirm-project");

const readEnv = (file) => {
  const p = resolve(ROOT, file);
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
};
const dev = readEnv(".env.development");
const URL_ = process.env.SUPABASE_URL || dev.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || dev.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !ANON) {
  console.error("No Supabase URL / anon key. Expected them in .env.development.");
  process.exit(1);
}
const REF = new URL(URL_).hostname.split(".")[0];

// ---- the data -------------------------------------------------------------

const iso = (d) => d.toISOString();
const today = new Date();
const atNoon = (y, m, day) => new Date(Date.UTC(y, m, day, 6, 30)); // 12:00 IST

/** Small deterministic generator so every run produces the same workspace. */
let seed = 20261104;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (lo, hi) => Math.round(lo + rnd() * (hi - lo));
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];

function buildPlan() {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const firstOfThisMonth = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const openingDate = iso(atNoon(y, m - 3, 1)).slice(0, 10);

  const accounts = [
    { name: "HDFC Salary (sandbox)", type: "bank", bank: "HDFC Bank", last4: "1234", opening_balance: 85000, opening_date: openingDate },
    { name: "Cash wallet (sandbox)", type: "cash", opening_balance: 3000, opening_date: openingDate },
  ];

  const income_streams = [
    { name: "Salary (sandbox)", amount: 62000, currency: "INR", type: "active", frequency: "monthly", notes: TAG },
  ];

  // Three full past months plus this month so far.
  const tx = [];
  for (let back = 3; back >= 0; back--) {
    const mm = m - back;
    const day = (d) => atNoon(y, mm, d);
    const past = (d) => day(d) <= today;
    const add = (type, amount, category, description, d) => {
      if (past(d)) tx.push({ type, amount, category, description: `${TAG} ${description}`, occurred_at: iso(day(d)) });
    };
    add("income", 62000, "Salary", "Monthly salary", 1);
    add("expense", 18000, "Rent", "House rent", 2);
    add("expense", between(1500, 2100), "Utilities", "Electricity bill", 8);
    add("expense", 649, "Subscriptions", "Streaming plan", 15);
    for (const d of [4, 11, 18, 25]) add("expense", between(1100, 2300), "Food & Dining", "Groceries", d);
    for (const d of [6, 13, 20, 27]) add("expense", between(250, 900), "Food & Dining", pick(["Swiggy", "Dinner out", "Coffee with friends"]), d);
    for (const d of [3, 9, 16, 23]) add("expense", between(60, 420), "Transport", pick(["Metro card top-up", "Auto fare", "Cab"]), d);
    add("expense", between(900, 3500), "Shopping", pick(["Amazon order", "Clothes", "Home items"]), 12);
    if (back % 2 === 0) add("expense", between(300, 1400), "Healthcare", "Pharmacy", 21);
    if (back === 1) add("expense", 3200, "Education", "Course fee", 14);
  }

  const budgets = [
    { bucket: "Needs", period: "monthly", period_start: firstOfThisMonth, allocated: 32000 },
    { bucket: "Wants", period: "monthly", period_start: firstOfThisMonth, allocated: 14000 },
    { bucket: "Savings", period: "monthly", period_start: firstOfThisMonth, allocated: 16000 },
  ];

  const goals = [
    { title: "Emergency fund (sandbox)", target_amount: 150000, current_amount: 45000, category: "Emergency", status: "active" },
  ];

  const renewal = new Date(today.getTime() + 75 * 86400000);
  const insurance = [
    { category: "health", policy_name: "Family health cover (sandbox)", provider: "Sample Insurer", premium: 18500, sum_insured: 500000, due_date: iso(renewal).slice(0, 10), notes: TAG },
  ];

  return { accounts, income_streams, transactions: tx, budgets, goals, insurance };
}

const plan = buildPlan();
const counts = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length]));

// ---- dry run --------------------------------------------------------------

if (!APPLY && !CLEAN) {
  console.log(`DRY RUN. Nothing is written. Project: ${REF}`);
  console.log("Would create:", counts);
  const t = plan.transactions;
  const inc = t.filter((x) => x.type === "income").reduce((s, x) => s + x.amount, 0);
  const exp = t.filter((x) => x.type === "expense").reduce((s, x) => s + x.amount, 0);
  const open = plan.accounts.reduce((s, a) => s + a.opening_balance, 0);
  console.log(`Seeded totals: income ${inc}, expenses ${exp}, opening balances ${open}  ->  net worth about ${open + inc - exp}`);
  console.log("First 5 transactions:");
  for (const x of t.slice(0, 5)) console.log("  ", x.occurred_at.slice(0, 10), x.type.padEnd(7), String(x.amount).padStart(6), x.category, "-", x.description);
  console.log(`\nTo write: SEED_EMAIL=... SEED_PASSWORD=... node scripts/seed-usability-sandbox.mjs --apply --confirm-project ${REF}`);
  process.exit(0);
}

// ---- write / clean --------------------------------------------------------

if (CONFIRM !== REF) {
  console.error(`Refusing: --confirm-project must be "${REF}" (the project in .env.development). Got "${CONFIRM ?? ""}".`);
  process.exit(1);
}
const { SEED_EMAIL, SEED_PASSWORD } = process.env;
if (!SEED_EMAIL || !SEED_PASSWORD) {
  console.error("Set SEED_EMAIL and SEED_PASSWORD in the environment for the TEST login.");
  process.exit(1);
}

const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: SEED_EMAIL, password: SEED_PASSWORD });
if (authErr) {
  console.error("Sign-in failed:", authErr.message);
  process.exit(1);
}
const userId = auth.user.id;
console.log(`Signed in as the test user. Project ${REF}.`);

const TABLES = ["transactions", "accounts", "income_streams", "budgets", "goals", "insurance"];

if (CLEAN) {
  if (!existsSync(IDS_FILE)) {
    console.error(`No ${IDS_FILE}; nothing recorded to clean.`);
    process.exit(1);
  }
  const ids = JSON.parse(readFileSync(IDS_FILE, "utf8"));
  if (ids.user_id !== userId) {
    console.error("The recorded ids belong to a different login. Refusing.");
    process.exit(1);
  }
  for (const t of TABLES) {
    if (!ids.tables[t]?.length) continue;
    const { error } = await sb.from(t).delete().in("id", ids.tables[t]);
    console.log(error ? `  ${t}: FAILED ${error.message}` : `  ${t}: removed ${ids.tables[t].length}`);
  }
  unlinkSync(IDS_FILE);
  process.exit(0);
}

if (existsSync(IDS_FILE)) {
  console.error(`${IDS_FILE} exists: a previous seed has not been cleaned. Run --clean first.`);
  process.exit(1);
}
const { count, error: cErr } = await sb.from("transactions").select("id", { count: "exact", head: true });
if (cErr) {
  console.error("Could not check the workspace:", cErr.message);
  process.exit(1);
}
if (count > 0 && !ALLOW_NONEMPTY) {
  console.error(`Refusing: this workspace already has ${count} transactions. Seeding would mix fake data into real records. Use a fresh test login, or pass --allow-nonempty if you are sure.`);
  process.exit(1);
}

const record = { user_id: userId, project: REF, at: new Date().toISOString(), tables: {} };
const save = () => writeFileSync(IDS_FILE, JSON.stringify(record, null, 2));

async function insert(table, rows) {
  const { data, error } = await sb.from(table).insert(rows).select("id");
  if (error) {
    console.error(`  ${table}: FAILED ${error.message}`);
    console.error(`  Rows already written are listed in ${IDS_FILE}. Run --clean, fix the cause, run again.`);
    process.exit(1);
  }
  record.tables[table] = (record.tables[table] ?? []).concat(data.map((r) => r.id));
  save();
  console.log(`  ${table}: ${data.length}`);
  return data;
}

const withUser = (rows) => rows.map((r) => ({ ...r, user_id: userId }));
const accs = await insert("accounts", withUser(plan.accounts));
const bankId = accs[0].id;
await insert("income_streams", withUser(plan.income_streams));
// Everything except cash spending is linked to the bank account so its balance, and net worth, move.
await insert("transactions", withUser(plan.transactions.map((t) => ({ ...t, currency: "INR", account_id: bankId }))));
await insert("budgets", withUser(plan.budgets));
await insert("goals", withUser(plan.goals));
await insert("insurance", withUser(plan.insurance));
console.log(`Done. Ids recorded in ${IDS_FILE}. Remove with --clean.`);
