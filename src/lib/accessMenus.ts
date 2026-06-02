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
  { id: "insurance", label: "Insurance" },
  { id: "budget-allocator", label: "Budget Allocator" },
  { id: "net-worth", label: "Net Worth" },
  { id: "subscriptions", label: "Subscriptions" },
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