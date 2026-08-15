export const ACCESS_MENUS: { id: string; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  { id: "investments", label: "Investments" },
  { id: "budget", label: "Budget" },
  { id: "goals", label: "Goals" },
  { id: "reminders", label: "Reminders" },
  { id: "calculator", label: "Calculator" },
  { id: "bill-scan", label: "Bill Scan" },
  { id: "import", label: "Import" },
  // BUG-022: recognized here and in all_feature_menus() (see
  // supabase/migrations/20260815070000_bug022_export_menu_id.sql) so this
  // list and the DB stay in step per accessMenus.test.ts. App.tsx's /export
  // route still gates on menuId="import" until that migration is live —
  // flipping it first would make get_effective_menus() return "export" for
  // nobody, since the live DB doesn't know the id yet.
  { id: "export", label: "Export" },
  { id: "insurance", label: "Insurance" },
  { id: "net-worth", label: "Net Worth" },
  { id: "trips", label: "Trips" },
  { id: "billing", label: "Billing" },
];

export const ALL_MENU_IDS = ACCESS_MENUS.map((m) => m.id);

export type CollaboratorRole = "admin" | "viewer";

export type Collaborator = {
  id: string;
  name: string;
  email: string;
  role: CollaboratorRole;
  menuAccess: string[];
};