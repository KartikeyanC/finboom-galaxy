/**
 * Stage 5.1 — one place that answers "which version of the terms is live?".
 *
 * The version and date are used in three places that must never disagree: the
 * two documents themselves, the notice shown at sign-up, and (once the
 * migration lands) the acceptance recorded against the account. If a document
 * changes materially, bump BOTH constants in the same edit — the version is
 * what tells you whether an existing user has accepted the current text.
 *
 * ⚠️ The documents were drafted from the system as built (see the data
 * inventory in each) and are accurate to it, but they have NOT been reviewed by
 * a lawyer. That review is a launch blocker, not a nice-to-have.
 */
export const LEGAL_VERSION = "2026-08-11";

/** Human-readable effective date, shown at the top of both documents. */
export const LEGAL_EFFECTIVE = "11 August 2026";

/**
 * Where a privacy or data-rights request goes.
 *
 * Stage 5.7: this was a placeholder on a branded domain with no mailbox — a
 * promise made in the privacy policy that nothing could keep. The
 * address now lives in `lib/support.ts`; re-exported here so the documents read
 * naturally and there is still exactly one place to change it.
 */
export { PRIVACY_CONTACT } from "@/lib/support";
