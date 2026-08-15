/**
 * Stage 5.7 — the one place that answers "how does someone reach a human?".
 *
 * There were three copies of it — one in `payments.ts`, one in `legal.ts` and
 * one hardcoded in the landing footer — all placeholders on a branded domain
 * with no mailbox (BUG-073). Every "contact us" in the product was therefore a
 * dead end, including the one the privacy policy offers for a data-rights
 * request, which is a promise rather than a nicety.
 *
 * One constant, one builder, and a test that fails if a second address appears
 * anywhere in `src/` (the ADR-0008 pattern). Changing where support mail goes
 * is a one-line edit, which is the point.
 */

/**
 * Where support mail goes today.
 *
 * The user chose the address the project already uses over a branded one on a
 * domain that cannot yet receive mail: a real inbox beats a nice-looking dead
 * end. Swap it here when `finroot.app` has a mailbox, and nothing else needs
 * to change.
 */
export const SUPPORT_EMAIL = "finroot95@gmail.com";

/**
 * Data-rights requests (DPDP / GDPR) go to the same inbox for now.
 *
 * A separate `privacy@` address is worth having once mail is hosted, because
 * these requests have a legal clock on them and should not be lost in general
 * support. Until then, pointing the privacy policy at an address nobody reads
 * would be worse than sharing one that is actually monitored.
 */
export const PRIVACY_CONTACT = SUPPORT_EMAIL;

/**
 * What we can honestly promise about a reply.
 *
 * FinRoot is run by one person. An invented "24-hour SLA" is a lie a support
 * page tells once, and then the user is both broken and misled.
 */
export const SUPPORT_RESPONSE = "Usually within a couple of days — this is a small team, not a call centre.";

export interface SupportContext {
  /** Signed-in user, if any. */
  email?: string | null;
  userId?: string | null;
  /** Active workspace. */
  workspaceId?: string | null;
  workspaceName?: string | null;
  planName?: string | null;
  /** Route the user was on when they asked for help. */
  path?: string | null;
  /** Build stamp, so we know which version of the app they are looking at. */
  build?: string | null;
  userAgent?: string | null;
}

/**
 * The block of facts that turns "it doesn't work" into something answerable.
 *
 * It is put in the mail BODY on purpose: the user sees it, can read it, and can
 * delete any line before sending. Nothing is collected or transmitted by the
 * app — the user's own mail client sends whatever they choose to send.
 *
 * Ids, not names, for the workspace: a support reply has to find the row, and
 * two workspaces can share a name.
 */
export function supportDiagnostics(ctx: SupportContext): string {
  const lines: [string, string | null | undefined][] = [
    ["Account", ctx.email],
    ["User id", ctx.userId],
    ["Workspace", ctx.workspaceName],
    ["Workspace id", ctx.workspaceId],
    ["Plan", ctx.planName],
    ["Page", ctx.path],
    ["Build", ctx.build],
    ["Browser", ctx.userAgent],
  ];
  return lines
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
}

export interface SupportMailOptions {
  subject?: string;
  /** What the user is expected to fill in, above the diagnostics. */
  intro?: string;
  context?: SupportContext;
  to?: string;
}

/** A `mailto:` with the diagnostics already written out, below a blank space to type in. */
export function supportMailto(options: SupportMailOptions = {}): string {
  const { subject = "FinRoot support", intro, context, to = SUPPORT_EMAIL } = options;
  const diagnostics = context ? supportDiagnostics(context) : "";
  const body = [
    intro ?? "What happened, and what you expected instead:",
    "",
    "",
    diagnostics ? `--- the details below help us find it ---\n${diagnostics}` : "",
  ]
    .join("\n")
    .trimEnd();
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * The build stamp, injected by Vite at build time.
 *
 * "Which version are you on?" is the first question of most support threads and
 * the one users can never answer. In dev it reads as `dev`.
 */
export function buildStamp(): string {
  try {
    return typeof __BUILD_STAMP__ === "string" ? __BUILD_STAMP__ : "unknown";
  } catch {
    return "unknown";
  }
}
