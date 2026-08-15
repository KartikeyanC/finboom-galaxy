/**
 * Decorative per-module emoji, shared by the member permission grid and the
 * invite card — split out of WorkspaceManage.tsx in Stage 4.13.
 *
 * Purely visual: every consumer renders the module's real label next to it, so
 * nothing here carries meaning a reader would miss without it. Keys are the
 * canonical menu ids from `@/lib/accessMenus`; callers fall back to 📦.
 */
export const MODULE_ICON: Record<string, React.ReactNode> = {
  dashboard:   <span className="text-[11px]">🏠</span>,
  income:      <span className="text-[11px]">💰</span>,
  expenses:    <span className="text-[11px]">🧾</span>,
  investments: <span className="text-[11px]">📈</span>,
  budget:      <span className="text-[11px]">🎯</span>,
  goals:       <span className="text-[11px]">🏆</span>,
  reminders:   <span className="text-[11px]">🔔</span>,
  calculator:  <span className="text-[11px]">🧮</span>,
  "bill-scan": <span className="text-[11px]">📷</span>,
  import:      <span className="text-[11px]">📥</span>,
  insurance:   <span className="text-[11px]">🛡️</span>,
  "net-worth": <span className="text-[11px]">⚖️</span>,
  trips:       <span className="text-[11px]">✈️</span>,
  billing:     <span className="text-[11px]">💳</span>,
};
