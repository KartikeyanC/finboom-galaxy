/**
 * Shapes returned by the Product Owner tenant RPCs — split out of
 * PoTenants.tsx in Stage 4.13 so the page and its four sub-components can
 * share them.
 *
 * The row type is `PoTenant`, not `TenantRow`: `TenantRow` is now the name of
 * the component that renders one, and a type and a component sharing a name in
 * the same import graph is a rename waiting to go wrong.
 *
 * These are hand-written rather than pulled from `types.ts`: `po_list_tenants`
 * returns a composed aggregate (counts, plan name, sub status), and PO code
 * must never reach past those aggregates into raw finance rows.
 */
export type PoTenant = {
  id: string;
  name: string;
  status: string;
  owner_email: string | null;
  member_count: number;
  plan_name: string | null;
  sub_status: string | null;
  created_at: string;
  menu_overrides?: { allow?: string[] } | null;
};

export type Plan = { id: string; name: string; menu_set: string[]; is_default: boolean };
