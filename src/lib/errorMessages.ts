import { toast } from "sonner";

/**
 * One place that turns an error into something a person can act on (BUG-012).
 *
 * Every mutation used to toast the raw `error.message`, which showed users things
 * like `new row violates row-level security policy for table "transactions"`.
 * That is frightening, unactionable, and tells an attacker the table names.
 *
 * Two rules here:
 *   1. The raw error always reaches the console — debuggability is not the
 *      thing being traded away.
 *   2. Messages our own code authored (`RAISE EXCEPTION` in an RPC, or a
 *      thrown `Error` in a hook) are already written for people, so they pass
 *      through untouched. Only database and transport noise gets translated.
 */

export const DEFAULT_ERROR = "Something went wrong. Please try again.";

/** Postgres SQLSTATE for `RAISE EXCEPTION` — i.e. a message we wrote. */
const RAISED_BY_US = "P0001";

/**
 * Constraint names → what the user actually did wrong. Adding a constraint in a
 * migration without adding a line here is not fatal: the generic message for
 * that error class is still safe, just vaguer.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  // goals
  goals_current_amount_nonneg: "The amount saved cannot be negative.",
  goals_target_amount_positive: "A goal needs a target above zero.",
  // budgets
  budgets_allocated_nonneg: "A budget cannot be negative.",
  budgets_tenant_bucket_period_key: "That bucket already has a budget for this period.",
  // transactions
  transactions_type_check: "That is not a transaction type we support.",
  transactions_transfer_dest_check:
    "A transfer needs a destination account, and only a transfer can have one.",
  transactions_import_hash_key: "Those rows have already been imported.",
  transactions_recurring_period_unique: "This item has already been marked for that due date.",
  // everything else with a fixed set of values
  accounts_type_check: "That is not an account type we support.",
  trips_kind_check: "That is not a trip type we support.",
  trips_status_check: "That is not a trip status we support.",
  reminders_context_check: "That is not a reminder type we support.",
  reminders_status_check: "That is not a reminder status we support.",
  investments_asset_check: "That is not an asset type we support.",
  insurance_category_check: "That is not an insurance category we support.",
  net_worth_entries_kind_check: "That is not a net-worth entry type we support.",
  income_streams_type_check: "That is not an income type we support.",
  income_streams_frequency_check: "That is not a frequency we support.",
  income_streams_currency_check: "That is not a currency we support.",
  recurring_items_type_check: "That is not a recurring item type we support.",
  recurring_items_frequency_check: "That is not a frequency we support.",
  tracked_subscriptions_frequency_check: "That is not a billing frequency we support.",
  tracked_subscriptions_status_check: "That is not a subscription status we support.",
  demat_ledger_type_check: "That is not a ledger entry type we support.",
  demat_ledger_amount_check: "The amount must be greater than zero.",
  // workspace + platform
  tenant_members_role_check: "That is not a role we support.",
  tenant_members_status_check: "That is not a membership status we support.",
  tenants_status_check: "That is not a workspace status we support.",
  net_worth_snapshots_unique_day: "Today's net worth has already been recorded.",
  // billing + platform admin
  plans_name_key: "A plan with that name already exists.",
  plans_interval_check: "A plan can be billed monthly or yearly.",
  subscriptions_tenant_unique: "This workspace already has a subscription.",
  subscriptions_provider_check: "That is not a billing provider we support.",
  coupons_code_key: "A coupon with that code already exists.",
  profiles_username_key: "That username is already taken.",
  profiles_mobile_key: "That mobile number is already in use.",
  pa_po_number_id_unique: "That ID is already assigned to another admin.",
  pa_po_user_id_unique: "That ID is already assigned to another admin.",
  pa_po_number_id_fmt: "That ID is not in the required format.",
  pa_po_user_id_fmt: "That ID is not in the required format.",
};

/** Generic copy per SQLSTATE class, used when the constraint is unknown. */
const SQLSTATE_MESSAGES: Record<string, string> = {
  "23505": "That already exists.",
  "23503": "Something this depends on is missing, or it is still in use elsewhere.",
  "23514": "Those values are not allowed.",
  "23502": "A required field is missing.",
  "22P02": "One of those values is not in the right format.",
  "22003": "That number is too large.",
  "42501": "You do not have permission to do that.",
  "40001": "Too many changes at once — please try again.",
  "40P01": "Too many changes at once — please try again.",
  PGRST116: "That record no longer exists.",
  PGRST301: "Your session has expired. Please sign in again.",
};

/** Sign-in and sign-up failures, matched on the text GoTrue returns. */
const AUTH_PATTERNS: [RegExp, string][] = [
  [/invalid login|invalid credentials/i, "The email or password is incorrect. Please try again."],
  [/email not confirmed/i, "Please confirm your email address before signing in."],
  [/already registered/i, "An account with this email already exists. Try signing in instead."],
  [/password.*(6|at least)/i, "Please choose a longer password."],
  [/rate.*limit|too many requests/i, "Too many attempts. Please wait a moment and try again."],
  [/token.*expired|expired.*token/i, "That link has expired. Please request a new one."],
  [/session.*(missing|expired)/i, "Your session has expired. Please sign in again."],
];

/** Anything that smells like the database talking rather than the product. */
const LEAKY = /row-level security|violates|constraint|relation ".*"|column ".*"|duplicate key|SQLSTATE|permission denied for/i;

type Errorish = {
  code?: string | number;
  message?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  name?: string;
  error_description?: string;
  error?: string;
};

const asErrorish = (error: unknown): Errorish =>
  typeof error === "string" ? { message: error } : ((error ?? {}) as Errorish);

/** The constraint a Postgres error names, if it names one. */
function constraintOf(e: Errorish): string | undefined {
  const haystack = `${e.message ?? ""} ${e.details ?? ""}`;
  for (const name of Object.keys(CONSTRAINT_MESSAGES)) {
    if (haystack.includes(name)) return name;
  }
  return undefined;
}

/**
 * A message worth showing a user.
 *
 * @param fallback shown when the error carries nothing usable — pass something
 *        specific to the action ("Could not save the goal") where you can.
 */
export function toUserMessage(error: unknown, fallback: string = DEFAULT_ERROR): string {
  if (error == null) return fallback;

  const e = asErrorish(error);
  const code = String(e.code ?? "");
  const raw = (e.message ?? e.error_description ?? e.error ?? "").trim();

  // Our own RPC exceptions are already written for people.
  if (code === RAISED_BY_US && raw) return raw;

  // Network before anything else: a failed fetch has no useful message.
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(raw)) {
    return "Cannot reach the server. Check your connection and try again.";
  }
  if (/aborted|timeout/i.test(raw)) {
    return "That took too long. Please try again.";
  }

  const constraint = constraintOf(e);
  if (constraint) return CONSTRAINT_MESSAGES[constraint];

  if (code && SQLSTATE_MESSAGES[code]) return SQLSTATE_MESSAGES[code];

  // RLS refusals arrive as 42501 but sometimes only as prose.
  if (/row-level security|permission denied/i.test(raw)) {
    return "You do not have permission to do that in this workspace.";
  }

  for (const [pattern, message] of AUTH_PATTERNS) {
    if (pattern.test(raw)) return message;
  }

  if (e.status === 401 || /unauthorized/i.test(raw)) {
    return "Your session has expired. Please sign in again.";
  }
  if (e.status === 403 || /forbidden/i.test(raw)) {
    return "You do not have permission to do that.";
  }
  if (e.status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (typeof e.status === "number" && e.status >= 500) {
    return "The server had a problem. Please try again in a moment.";
  }

  // Nothing recognised: show the message only if it reads like product copy.
  if (!raw || LEAKY.test(raw) || raw.length > 160) return fallback;
  return raw;
}

/**
 * BUG-100 — a revoked/expired session's queries used to fail into whatever
 * empty state the page shows a genuinely-new account, with no toast and no
 * redirect: `PGRST301`/401 is a real, distinct signal that the credential
 * itself is gone, not "there is nothing here yet". Callers that need to act
 * on it (redirect to `/auth`) check this instead of re-deriving it from text.
 */
export function isSessionExpiredError(error: unknown): boolean {
  const e = asErrorish(error);
  if (String(e.code ?? "") === "PGRST301") return true;
  if (e.status === 401) return true;
  return /session.*(missing|expired)|jwt.*expired/i.test(e.message ?? "");
}

/** Log the real error where developers can find it, whatever we tell the user. */
export function reportError(error: unknown, context?: string): void {
  if (context) console.error(`[${context}]`, error);
  else console.error(error);
}

/**
 * The one-liner that replaces a toast of the raw `error.message`.
 *
 * `title` gives the toast a heading and moves the explanation to the body —
 * use it when the action is worth naming ("Could not load billing").
 */
export function notifyError(
  error: unknown,
  opts?: { title?: string; fallback?: string; context?: string },
): void {
  reportError(error, opts?.context ?? opts?.title);
  const message = toUserMessage(error, opts?.fallback);
  if (opts?.title) toast.error(opts.title, { description: message });
  else toast.error(message);
}
