#!/usr/bin/env node
/**
 * Stage 0.10 — the test-account harness.
 *
 * Four suites (AUTHZ 23, SEC 20, NOTIF/WS 11, most of PO 23 — 77 cases) need
 * more than one account: a workspace containing an owner, an admin and a
 * viewer, a second workspace to prove isolation against, and three role JWTs a
 * REST client can carry. This builds that, and hands back the tokens.
 *
 *   node scripts/test-harness.mjs doctor      # what exists, what is missing
 *   node scripts/test-harness.mjs provision   # create it (needs the service key)
 *   node scripts/test-harness.mjs tokens      # mint the three role JWTs
 *
 * ── Why `provision` needs a key this repo does not carry ────────────────────
 * The project has `mailer_autoconfirm: false`, so an anon-key `signUp` creates
 * a user who cannot sign in until somebody clicks a link in an inbox no test
 * runner can reach. The Admin API's `email_confirm: true` is the only way to
 * create a usable account without a mailbox, and that needs the service-role
 * key. Supply it the same way `storage-purge.mjs` does — from the environment,
 * never from a VITE_ variable and never committed:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/test-harness.mjs provision
 *
 * The alternative, if you would rather not hand a script the service key: turn
 * on "Confirm email → off" in Dashboard → Authentication → Providers → Email,
 * run `provision` (it falls back to plain sign-up), then turn it back on.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const HARNESS_FILE = ".env.harness";

if (!URL_ || !ANON) {
  console.error("No Supabase URL / anon key. Expected them in .env.development.");
  process.exit(1);
}

/**
 * The six accounts `Test_Cases.md` names. Workspace A is the interesting one:
 * three roles in ONE workspace is what makes an authorization test meaningful,
 * because a viewer being refused only proves something if an owner in the same
 * workspace is allowed.
 */
const ACCOUNTS = [
  { key: "owner-a", role: "owner", note: "workspace A owner — A is created by the signup trigger" },
  { key: "admin-a", role: "admin", note: "invited into workspace A" },
  { key: "viewer-a", role: "viewer", note: "invited into workspace A" },
  { key: "owner-b", role: "owner", note: "workspace B — the isolation target for SEC-T07" },
  { key: "multi", role: "owner", note: "owns B and collaborates in A — the two-workspace case" },
  { key: "po", role: "owner", note: "platform admin; needs a platform_admins row" },
];

const emailFor = (key) => `finroot-harness+${key}@example.com`;

// ── plumbing ────────────────────────────────────────────────────────────────

const api = async (path, { method = "GET", token, key = ANON, body, headers = {} } = {}) => {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, body: json };
};

const signIn = async (email, password) => {
  const r = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  return r.ok ? r.body.access_token : null;
};

const rpc = (name, args, token) =>
  api(`/rest/v1/rpc/${name}`, { method: "POST", token, body: args ?? {} });

const claims = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());

// ── doctor ──────────────────────────────────────────────────────────────────

async function doctor() {
  console.log(`project      : ${URL_}`);
  console.log(`anon key     : present`);
  console.log(`service key  : ${SERVICE ? "present" : "MISSING — provision cannot run"}`);

  const settings = await api("/auth/v1/settings");
  const autoconfirm = settings.body?.mailer_autoconfirm;
  console.log(`autoconfirm  : ${autoconfirm}`);
  if (!SERVICE && !autoconfirm) {
    console.log(
      "\n⚠  Neither route to a usable account is open. Sign-up would create\n" +
        "   users stuck behind an email confirmation nothing here can receive.\n" +
        "   Supply SUPABASE_SERVICE_ROLE_KEY, or turn autoconfirm on in the dashboard.",
    );
  }

  const saved = readEnv(HARNESS_FILE);
  console.log("\naccount            can sign in   role in workspace A");
  for (const a of ACCOUNTS) {
    const email = emailFor(a.key);
    const pw = saved[`PW_${a.key.toUpperCase().replace(/-/g, "_")}`];
    let can = "no (no password on file)";
    let role = "—";
    if (pw) {
      const jwt = await signIn(email, pw);
      can = jwt ? "yes" : "NO — wrong password or unconfirmed";
      if (jwt) {
        const r = await api("/rest/v1/tenant_members?select=role,status&limit=5", { token: jwt });
        role = Array.isArray(r.body) ? r.body.map((m) => `${m.role}/${m.status}`).join(" ") : "?";
      }
    }
    console.log(`${a.key.padEnd(18)} ${can.padEnd(13)} ${role}`);
  }
}

// ── provision ───────────────────────────────────────────────────────────────

async function createUser(email, password) {
  if (SERVICE) {
    // The only way to get a usable account without a mailbox.
    const r = await api("/auth/v1/admin/users", {
      method: "POST",
      key: SERVICE,
      token: SERVICE,
      body: { email, password, email_confirm: true },
    });
    if (r.ok) return { created: true };
    // 422 = already registered, which is the idempotent case, not a failure.
    if (r.status === 422) return { created: false, existed: true };
    return { error: `${r.status} ${JSON.stringify(r.body).slice(0, 140)}` };
  }
  const r = await api("/auth/v1/signup", { method: "POST", body: { email, password } });
  if (!r.ok) return { error: `${r.status} ${JSON.stringify(r.body).slice(0, 140)}` };
  if (!r.body?.access_token && !r.body?.session) {
    return { error: "created but unconfirmed — no session. Turn autoconfirm on, or use the service key." };
  }
  return { created: true };
}

async function provision() {
  const settings = await api("/auth/v1/settings");
  if (!SERVICE && !settings.body?.mailer_autoconfirm) {
    console.error(
      "Refusing to run: no service-role key AND autoconfirm is off.\n" +
        "Every account created would be unusable and — without the service key —\n" +
        "impossible to delete again. See the header of this file for the two ways out.",
    );
    // Not `process.exit()`: killing the process while undici still holds a
    // keep-alive socket trips a libuv assertion on Windows and reports 127,
    // which reads as a crash rather than as a deliberate refusal.
    process.exitCode = 2;
    return;
  }

  const saved = readEnv(HARNESS_FILE);
  const passwords = {};
  for (const a of ACCOUNTS) {
    const varName = `PW_${a.key.toUpperCase().replace(/-/g, "_")}`;
    passwords[a.key] = saved[varName] || `Hx${randomBytes(9).toString("base64url")}!7`;
    const email = emailFor(a.key);
    const res = await createUser(email, passwords[a.key]);
    console.log(
      `${a.key.padEnd(10)} ${email.padEnd(38)} ${
        res.error ? "ERROR " + res.error : res.existed ? "already existed" : "created"
      }`,
    );
    if (res.error) process.exitCode = 1;
  }

  writeFileSync(
    resolve(ROOT, HARNESS_FILE),
    "# Stage 0.10 harness accounts — gitignored, regenerate with `provision`.\n" +
      ACCOUNTS.map(
        (a) => `PW_${a.key.toUpperCase().replace(/-/g, "_")}=${passwords[a.key]}`,
      ).join("\n") +
      "\n",
    "utf8",
  );
  console.log(`\npasswords written to ${HARNESS_FILE}`);

  // ── wire workspace A: owner-a invites admin-a and viewer-a ────────────────
  const ownerJwt = await signIn(emailFor("owner-a"), passwords["owner-a"]);
  if (!ownerJwt) {
    console.error("owner-a cannot sign in; cannot wire the workspace.");
    process.exitCode = 1;
    return;
  }
  const mine = await api("/rest/v1/tenant_members?select=tenant_id&role=eq.owner&limit=1", {
    token: ownerJwt,
  });
  const tenantA = mine.body?.[0]?.tenant_id;
  if (!tenantA) {
    console.error("owner-a has no owned workspace — the signup trigger did not fire.");
    process.exitCode = 1;
    return;
  }
  console.log(`\nworkspace A: ${tenantA}`);

  for (const [key, role] of [["admin-a", "admin"], ["viewer-a", "viewer"], ["multi", "viewer"]]) {
    const inv = await rpc(
      "create_invitation",
      { p_tenant_id: tenantA, p_email: emailFor(key), p_role: role },
      ownerJwt,
    );
    const token = Array.isArray(inv.body) ? inv.body[0]?.token : inv.body?.token;
    if (!token) {
      console.log(`${key.padEnd(10)} invite FAILED ${JSON.stringify(inv.body).slice(0, 120)}`);
      continue;
    }
    const jwt = await signIn(emailFor(key), passwords[key]);
    const acc = await rpc("accept_invitation", { p_token: token }, jwt);
    console.log(`${key.padEnd(10)} invited as ${role.padEnd(7)} → accept ${acc.status}`);
  }

  console.log("\n⚠  `po` still needs a platform_admins row — RLS blocks that from the client.");
  console.log("   With the service key:  POST /rest/v1/platform_admins  {\"user_id\": \"<po uid>\"}");
}

// ── tokens ──────────────────────────────────────────────────────────────────

async function tokens() {
  const saved = readEnv(HARNESS_FILE);
  const out = {};
  for (const key of ["owner-a", "admin-a", "viewer-a"]) {
    const pw = saved[`PW_${key.toUpperCase().replace(/-/g, "_")}`];
    if (!pw) {
      console.error(`no password for ${key} — run \`provision\` first`);
      process.exitCode = 1;
      return;
    }
    const jwt = await signIn(emailFor(key), pw);
    if (!jwt) {
      console.error(`${key} could not sign in`);
      process.exitCode = 1;
      return;
    }
    const c = claims(jwt);
    out[key] = jwt;
    console.log(`${key.padEnd(10)} sub=${c.sub}  exp=${new Date(c.exp * 1000).toISOString()}`);
  }
  writeFileSync(
    resolve(ROOT, ".env.harness.tokens"),
    Object.entries(out)
      .map(([k, v]) => `JWT_${k.toUpperCase().replace(/-/g, "_")}=${v}`)
      .join("\n") + "\n",
    "utf8",
  );
  console.log("\ntokens written to .env.harness.tokens (gitignored, ~1h lifetime)");
}

const cmd = process.argv[2] || "doctor";
const run = { doctor, provision, tokens }[cmd];
if (!run) {
  console.error(`unknown command "${cmd}" — expected doctor | provision | tokens`);
  process.exit(1);
}
await run();
