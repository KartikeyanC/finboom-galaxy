/**
 * Stage 5.2 — "give me everything you hold about me".
 *
 * The Export page already produced CSVs of the things people want in a
 * spreadsheet (transactions, income, investments, budgets, accounts). That is
 * a REPORT, not a data-portability export: it is filtered by a date range, it
 * drops the columns a spreadsheet doesn't need, and it says nothing about the
 * account, the workspace, reminders, insurance or the audit trail. India's DPDP
 * Act and GDPR Article 20 ask for the whole record in a machine-readable form,
 * which is what this module builds.
 *
 * Two rules hold it together:
 *
 * 1. **It reads through RLS as the signed-in user.** No SECURITY DEFINER, no
 *    service role. The export can therefore never contain more than the user
 *    was already allowed to read — the database decides, not this file.
 * 2. **Every table is accounted for.** Each personal-data table is listed in
 *    EXPORT_TABLES, and everything else is listed in NOT_PERSONAL with a
 *    reason. `dataExport.test.ts` reads the generated types and fails if a new
 *    table appears in neither list, so adding a table forces the decision
 *    rather than quietly omitting someone's data from their own export.
 */

export type ExportScope =
  /** Rows carrying `tenant_id` — the workspace being exported. */
  | "tenant"
  /** Rows carrying `user_id` — the signed-in user, across workspaces. */
  | "user"
  /** The single `profiles` row, keyed by `id` = the user. */
  | "self"
  /** The single `tenants` row, keyed by `id` = the workspace. It has no
   *  `tenant_id` column of its own — filtering it like the others asks the
   *  database for a column that does not exist. */
  | "workspace";

export type ExportTable = { table: string; scope: ExportScope; what: string };

/** Everything that is, or can contain, this user's personal data. */
export const EXPORT_TABLES: ExportTable[] = [
  { table: "profiles", scope: "self", what: "Your account details" },
  { table: "account_deletion_requests", scope: "user", what: "Any account-deletion request you have made" },
  { table: "tenants", scope: "workspace", what: "The workspace itself" },
  { table: "tenant_members", scope: "tenant", what: "Who is in the workspace, and their role" },
  { table: "tenant_settings", scope: "tenant", what: "Workspace preferences, including custom categories" },
  { table: "invitations", scope: "tenant", what: "Invitations sent from this workspace (tokens are stored hashed and are not exported)" },
  { table: "subscriptions", scope: "tenant", what: "Your plan and billing record" },
  { table: "notifications", scope: "user", what: "In-app notifications addressed to you" },
  { table: "audit_log", scope: "tenant", what: "Significant actions taken in this workspace" },

  { table: "transactions", scope: "tenant", what: "Income, expenses and transfers" },
  { table: "accounts", scope: "tenant", what: "Accounts and wallets" },
  { table: "budgets", scope: "tenant", what: "Budget allocations" },
  { table: "goals", scope: "tenant", what: "Savings goals" },
  { table: "income_streams", scope: "tenant", what: "Income sources" },
  { table: "investments", scope: "tenant", what: "Holdings" },
  { table: "demat_accounts", scope: "tenant", what: "Demat accounts" },
  { table: "demat_ledger", scope: "tenant", what: "Demat cash ledger" },
  { table: "insurance", scope: "tenant", what: "Insurance policies" },
  { table: "debts", scope: "tenant", what: "Debts and installment plans" },
  { table: "reminders", scope: "tenant", what: "Reminders" },
  { table: "recurring_items", scope: "tenant", what: "Recurring income and expenses" },
  { table: "recurring_reminders", scope: "tenant", what: "Reminder settings for recurring items" },
  { table: "tracked_subscriptions", scope: "tenant", what: "Subscriptions you track (Netflix, Spotify, …)" },
  { table: "net_worth_entries", scope: "tenant", what: "Net-worth assets and liabilities" },
  { table: "net_worth_snapshots", scope: "tenant", what: "Net-worth history" },
  { table: "trips", scope: "tenant", what: "Trips and their budgets" },
];

/**
 * Tables that hold no personal data. Each needs a reason, because "it isn't
 * personal" is a judgement someone should be able to disagree with in review.
 */
export const NOT_PERSONAL: Record<string, string> = {
  plans: "The plan catalogue — the same rows for everybody.",
  coupons: "Discount codes. Not attributed to a user.",
  site_settings: "Branding and marketing copy for the whole site.",
  retention_policy: "How long each kind of data is kept. Operational configuration.",
  price_cache: "Market prices keyed by security symbol. Shared, and contains nobody's identity.",
  platform_admins: "Which staff accounts are platform administrators.",
  storage_purge_queue: "Operational queue for deleting files after a workspace is purged.",
};

export type BundleManifest = {
  generated_at: string;
  format_version: number;
  application: string;
  user: { id: string; email: string | null };
  workspace: { id: string | null; name: string | null };
  /** Row counts per table, so the reader can see at a glance what arrived. */
  included: Record<string, number>;
  /** A table that could not be read, and why. Never silently dropped. */
  unavailable: { table: string; reason: string }[];
  notes: string[];
};

export type StoredDocument = { bucket: string; path: string; size: number | null; updated_at: string | null };

export type ExportBundle = {
  manifest: BundleManifest;
  data: Record<string, unknown[]>;
  documents: StoredDocument[];
};

export const FORMAT_VERSION = 1;

/** Reads one table through RLS. Injected so the builder stays testable. */
export type TableReader = (table: string, scope: ExportScope) => Promise<unknown[]>;
/** Lists the workspace's uploaded files. */
export type DocumentLister = () => Promise<StoredDocument[]>;

export type BuildInput = {
  user: { id: string; email: string | null };
  workspace: { id: string | null; name: string | null };
  application: string;
  readTable: TableReader;
  listDocuments: DocumentLister;
  now?: Date;
  tables?: ExportTable[];
};

/**
 * Build the bundle. A table that fails is recorded in `manifest.unavailable`
 * and the export continues: a partial export the user can see the gaps in
 * beats no export at all, and beats one that quietly omits a table.
 */
export async function buildExportBundle({
  user,
  workspace,
  application,
  readTable,
  listDocuments,
  now = new Date(),
  tables = EXPORT_TABLES,
}: BuildInput): Promise<ExportBundle> {
  const data: Record<string, unknown[]> = {};
  const included: Record<string, number> = {};
  const unavailable: { table: string; reason: string }[] = [];

  for (const t of tables) {
    try {
      const rows = await readTable(t.table, t.scope);
      data[t.table] = rows;
      included[t.table] = rows.length;
    } catch (e) {
      unavailable.push({ table: t.table, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  let documents: StoredDocument[] = [];
  try {
    documents = await listDocuments();
  } catch (e) {
    unavailable.push({ table: "documents", reason: e instanceof Error ? e.message : String(e) });
  }

  return {
    manifest: {
      generated_at: now.toISOString(),
      format_version: FORMAT_VERSION,
      application,
      user,
      workspace,
      included,
      unavailable,
      notes: [
        "This file contains everything stored about you in this workspace, exactly as it is held.",
        "It was read with your own permissions, so it cannot contain another workspace's data.",
        "Uploaded documents are listed, not embedded — download them from the Insurance page.",
        "Your screen-lock PIN is not here: it never leaves your browser, and only a hash of it is stored on the device.",
        "Invitation tokens are stored hashed and are deliberately not exported.",
      ],
    },
    data,
    documents,
  };
}

/** `finroot-data-export-2026-08-11.json` */
export function bundleFilename(now = new Date(), application = "finroot") {
  const slug = application.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${slug}-data-export-${now.toISOString().slice(0, 10)}.json`;
}

/** Total rows across every table that was read. */
export function totalRows(bundle: ExportBundle) {
  return Object.values(bundle.manifest.included).reduce((s, n) => s + n, 0);
}
