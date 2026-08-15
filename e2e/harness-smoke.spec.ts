import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, hasCreds } from "./auth";
import { harnessReady, rest, subject, tokenFor, tokenForCredentials } from "./rest";

/**
 * Stage 0.10 — proof that the harness plumbing works, before the accounts it
 * needs exist.
 *
 * The six accounts cannot be created here (the project has autoconfirm off and
 * there is no service-role key — `node scripts/test-harness.mjs doctor` says
 * so). But the part that would otherwise be discovered broken on the day the
 * accounts finally appear — the REST client, the JWT exchange, the refusal
 * semantics — can be proved right now against the one account that exists.
 *
 * So this file is deliberately two halves: what can be verified today, and the
 * role-based block that skips until `provision` has run.
 */

test.describe("Stage 0.10 · harness plumbing", () => {
  test.skip(!hasCreds, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  test("a password buys a JWT, and that JWT drives PostgREST", async () => {
    const jwt = await tokenForCredentials(EMAIL, PASSWORD);
    expect(jwt, "the demo account could not sign in").toBeTruthy();
    expect(subject(jwt as string)).toMatch(/^[0-9a-f-]{36}$/);

    const client = rest(jwt as string);
    const members = await client.select<{ role: string; status: string }[]>(
      "tenant_members",
      "select=tenant_id,role,status&limit=3",
    );
    expect(members.status).toBe(200);
    expect(Array.isArray(members.body)).toBeTruthy();

    const isPo = await client.rpc<boolean>("is_platform_admin");
    expect(isPo.status).toBe(200);
    expect(typeof isPo.body).toBe("boolean");
  });

  /**
   * The single most important property of this client: a refusal must arrive
   * as a status code, not as a thrown exception. Every SEC case is a negative
   * assertion, so a client that threw would make them all pass by accident.
   */
  test("an anonymous caller is refused, and the refusal is data not an exception", async () => {
    const anon = rest();

    const rows = await anon.select("tenant_members", "select=*&limit=1");
    // RLS gives an anonymous caller nothing. Either shape is a refusal; what
    // matters is that it came back rather than blowing up.
    expect(rows.status).toBeGreaterThanOrEqual(200);
    if (rows.status === 200) expect(rows.body).toEqual([]);

    const rpcRes = await anon.rpc("is_platform_admin");
    expect([200, 401, 403, 404]).toContain(rpcRes.status);
    if (rpcRes.status === 200) expect(rpcRes.body).toBeFalsy();

    // And a privileged RPC must not be callable anonymously at all.
    const forged = await anon.rpc("log_audit", { p_action: "harness-smoke" });
    expect(forged.status, "log_audit answered an anonymous caller").toBeGreaterThanOrEqual(400);
  });

  test("a bad password buys nothing", async () => {
    const jwt = await tokenForCredentials(EMAIL, "not-the-password-" + Date.now());
    expect(jwt).toBeNull();
  });
});

/**
 * Everything below needs the six accounts. It skips — loudly, by name — until
 * `scripts/test-harness.mjs provision` has run, so a session that thinks the
 * harness exists finds out immediately.
 */
test.describe("Stage 0.10 · role tokens", () => {
  test.skip(
    !harnessReady,
    "Stage 0.10 accounts do not exist — run `node scripts/test-harness.mjs doctor`",
  );

  test("each role signs in and is who it claims to be", async () => {
    const roles = ["owner-a", "admin-a", "viewer-a"] as const;
    const subs = new Set<string>();
    for (const role of roles) {
      const jwt = await tokenFor(role);
      expect(jwt, `${role} could not sign in`).toBeTruthy();
      subs.add(subject(jwt as string));
    }
    // Three distinct identities, or the "roles" are one account wearing hats
    // and every AUTHZ result would be meaningless.
    expect(subs.size, "the three role accounts are not distinct users").toBe(3);
  });

  test("all three see the same workspace, with different roles in it", async () => {
    // Two compounding reasons a plain, unfiltered-by-caller query gives the
    // wrong row here, both real properties of the schema rather than test
    // bugs to design around quietly:
    //   1. admin-a and viewer-a each have TWO active memberships — workspace
    //      A (what this test cares about) and their own personal tenant,
    //      created by the same signup trigger that made them a usable
    //      account — so a query with no tenant filter can return either.
    //   2. tenant_members' SELECT policy is "any member of a tenant can see
    //      every member of that tenant" (a workspace needs to list its own
    //      team), so even filtering by tenant_id alone returns all FOUR rows
    //      for workspace A — owner, admin, viewer, viewer — not just the
    //      caller's own. body[0] of that is deterministically the earliest-
    //      created row (owner-a's own, from signup), which is why filtering
    //      by tenant_id alone still collapsed every caller's "role" to
    //      "owner" instead of revealing distinct roles.
    // The caller's own user_id — decoded from their own JWT via subject() —
    // is what actually narrows this to "my own row in workspace A".
    const ownerJwt = (await tokenFor("owner-a")) as string;
    const ownerRows = await rest(ownerJwt).select<{ tenant_id: string; role: string }[]>(
      "tenant_members",
      `select=tenant_id,role&status=eq.active&user_id=eq.${subject(ownerJwt)}`,
    );
    expect(ownerRows.status).toBe(200);
    const tenantA = (ownerRows.body as { tenant_id: string; role: string }[])[0]?.tenant_id;
    expect(tenantA, "owner-a has no workspace").toBeTruthy();

    const seen: Record<string, string> = {};
    for (const role of ["owner-a", "admin-a", "viewer-a"] as const) {
      const jwt = (await tokenFor(role)) as string;
      const r = await rest(jwt).select<{ tenant_id: string; role: string }[]>(
        "tenant_members",
        `select=tenant_id,role&status=eq.active&tenant_id=eq.${tenantA}&user_id=eq.${subject(jwt)}`,
      );
      expect(r.status).toBe(200);
      const row = (r.body as { tenant_id: string; role: string }[])[0];
      expect(row, `${role} has no active membership in workspace A`).toBeTruthy();
      seen[role] = `${row.tenant_id}:${row.role}`;
    }
    const tenants = new Set(Object.values(seen).map((v) => v.split(":")[0]));
    expect(tenants.size, `the three roles are not in one workspace: ${JSON.stringify(seen)}`).toBe(1);
    expect(new Set(Object.values(seen).map((v) => v.split(":")[1])).size).toBe(3);
  });
});
