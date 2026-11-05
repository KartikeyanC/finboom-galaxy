/**
 * Stage 5.2 — where a person's own account-deletion request stands.
 *
 * A request is a queued intent (migration 20260811130000): nothing is deleted
 * before `purge_after`, the person can cancel until then, and an operator
 * completes it with service_role (docs/runbooks/account-deletion.md). Pure,
 * so every state the card can show is tested without a database.
 */

export type DeletionRequest = {
  requested_at: string;
  purge_after: string;
  cancelled_at: string | null;
  completed_at: string | null;
};

export type DeletionState =
  /** No request, or one that was cancelled. */
  | { kind: "none" }
  /** Requested; can still be cancelled. */
  | { kind: "pending"; requestedAt: string; purgeAfter: string; daysLeft: number }
  /** The recovery window is over: waiting for the operator, still cancellable. */
  | { kind: "due"; requestedAt: string; purgeAfter: string }
  | { kind: "done" };

const DAY = 86_400_000;

export function deletionState(row: DeletionRequest | null | undefined, now: Date): DeletionState {
  if (!row || row.cancelled_at) return { kind: "none" };
  if (row.completed_at) return { kind: "done" };
  const left = new Date(row.purge_after).getTime() - now.getTime();
  if (left <= 0) return { kind: "due", requestedAt: row.requested_at, purgeAfter: row.purge_after };
  return {
    kind: "pending",
    requestedAt: row.requested_at,
    purgeAfter: row.purge_after,
    daysLeft: Math.ceil(left / DAY),
  };
}
