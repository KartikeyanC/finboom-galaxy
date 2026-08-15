import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Search, TrendingUp, TrendingDown, Target, Repeat,
  Wallet, LayoutDashboard, Calculator, Bell, Settings,
  FileText, BarChart2, Shield, ArrowRight, Receipt,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTransactions } from "@/hooks/useTransactions";
import { useGoals } from "@/hooks/useGoals";
import { useBudgets } from "@/hooks/useBudgets";
import { useRecurring } from "@/hooks/useRecurring";
import { formatMoney } from "@/lib/finance";

// ── Static page shortcuts ────────────────────────────────────────────────────
const PAGES = [
  { label: "Dashboard",       path: "/app",               icon: LayoutDashboard, keywords: "home overview wealth" },
  { label: "Income",          path: "/app/income",         icon: TrendingUp,      keywords: "salary earnings revenue" },
  { label: "Expenses",        path: "/app/expenses",       icon: TrendingDown,    keywords: "spending cost payments" },
  { label: "Budget",          path: "/app/budget",         icon: Wallet,          keywords: "allocation plan bucket" },
  { label: "Goals",           path: "/app/goals",          icon: Target,          keywords: "savings milestone target" },
  { label: "Investments",     path: "/app/investments",    icon: BarChart2,       keywords: "portfolio stocks mutual fund sip" },
  { label: "Recurring",       path: "/app/reminders",      icon: Repeat,          keywords: "recurring emi subscription" },
  { label: "Bill Scanner",    path: "/app/bill-scan",      icon: Receipt,         keywords: "scan receipt ocr" },
  { label: "Net Worth",       path: "/app/net-worth",      icon: TrendingUp,      keywords: "networth assets liabilities" },
  { label: "Insurance",       path: "/app/insurance",      icon: Shield,          keywords: "health life term policy" },
  { label: "Calculator",      path: "/app/calculator",     icon: Calculator,      keywords: "emi sip returns compute" },
  { label: "Notifications",   path: "/app/notifications",  icon: Bell,            keywords: "alerts reminders" },
  { label: "Import",          path: "/app/import",         icon: FileText,        keywords: "csv bank statement upload" },
  { label: "Settings",        path: "/app/settings",       icon: Settings,        keywords: "preferences account theme" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function GlobalSearch({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  // Reset query on close
  useEffect(() => { if (!open) setQ(""); }, [open]);

  // Stage 4.2: this comment used to claim the queries only load when the dialog
  // is open, and nothing enforced it. GlobalSearch is mounted by DashboardLayout
  // on EVERY app page, so the unbounded transaction fetch ran on every single
  // page view — including the dashboard, which had otherwise been moved off it.
  // Search legitimately wants the whole ledger; it just does not want it until
  // someone opens the palette.
  const { data: allTxns = [] }    = useTransactions(undefined, "all", { enabled: open });
  // The rest are small, tenant-scoped tables and are left eager for now.
  const { data: goals = [] }      = useGoals();
  const { data: budgets = [] }    = useBudgets();
  const { data: recurring = [] }  = useRecurring();

  const lower = q.toLowerCase().trim();

  // ── Filtered results ────────────────────────────────────────────────────────
  const pages = useMemo(() =>
    PAGES.filter((p) =>
      !lower ||
      p.label.toLowerCase().includes(lower) ||
      p.keywords.includes(lower)
    ), [lower]);

  const txns = useMemo(() =>
    allTxns.filter((t) =>
      lower &&
      (
        t.description?.toLowerCase().includes(lower) ||
        t.category.toLowerCase().includes(lower) ||
        String(t.amount).includes(lower)
      )
    ).slice(0, 6),
  [allTxns, lower]);

  const matchedGoals = useMemo(() =>
    goals.filter((g) =>
      lower &&
      (
        g.title.toLowerCase().includes(lower) ||
        (g.category ?? "").toLowerCase().includes(lower)
      )
    ).slice(0, 4),
  [goals, lower]);

  const matchedBudgets = useMemo(() =>
    budgets.filter((b) =>
      lower &&
      b.bucket.toLowerCase().includes(lower)
    ).slice(0, 4),
  [budgets, lower]);

  const matchedRecurring = useMemo(() =>
    recurring.filter((r) =>
      lower &&
      (
        r.name.toLowerCase().includes(lower) ||
        r.category.toLowerCase().includes(lower) ||
        (r.notes ?? "").toLowerCase().includes(lower)
      )
    ).slice(0, 4),
  [recurring, lower]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const hasResults =
    pages.length > 0 ||
    txns.length > 0 ||
    matchedGoals.length > 0 ||
    matchedBudgets.length > 0 ||
    matchedRecurring.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search transactions, goals, pages…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList className="max-h-[480px]">
        {!hasResults && (
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
              <Search className="h-8 w-8 opacity-30" />
              <p className="text-sm">No results for "<span className="text-foreground">{q}</span>"</p>
              <p className="text-xs opacity-60">Try a category, description or page name</p>
            </div>
          </CommandEmpty>
        )}

        {/* Pages */}
        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((p) => (
              <CommandItem
                key={p.path}
                value={`page-${p.label}-${p.keywords}`}
                onSelect={() => go(p.path)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted shrink-0">
                  <p.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="flex-1 text-sm">{p.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Transactions */}
        {txns.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Transactions">
              {txns.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`txn-${t.id}-${t.description}-${t.category}`}
                  onSelect={() => go(t.type === "income" ? "/app/income" : "/app/expenses")}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${
                    t.type === "income" ? "bg-emerald-500/15" : "bg-red-500/15"
                  }`}>
                    {t.type === "income"
                      ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      : <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                    }
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {t.description || t.category}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.category} · {format(new Date(t.occurred_at), "dd MMM yyyy")}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${
                    t.type === "income" ? "text-emerald-500" : "text-red-400"
                  }`}>
                    {t.type === "income" ? "+" : "-"}{formatMoney(t.amount, t.currency)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Goals */}
        {matchedGoals.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Goals">
              {matchedGoals.map((g) => {
                const pct = g.target_amount > 0
                  ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100))
                  : 0;
                return (
                  <CommandItem
                    key={g.id}
                    value={`goal-${g.id}-${g.title}-${g.category}`}
                    onSelect={() => go("/app/goals")}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 shrink-0">
                      <Target className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.title}</p>
                      <p className="text-xs text-muted-foreground">{g.category ?? "Goal"} · {pct}% complete</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 capitalize">{g.status}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {/* Budgets */}
        {matchedBudgets.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Budgets">
              {matchedBudgets.map((b) => (
                <CommandItem
                  key={b.id}
                  value={`budget-${b.id}-${b.bucket}`}
                  onSelect={() => go("/app/budget")}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15 shrink-0">
                    <Wallet className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.bucket}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(b.spent, "INR")} spent of {formatMoney(b.allocated, "INR")}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Recurring */}
        {matchedRecurring.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recurring">
              {matchedRecurring.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`recurring-${r.id}-${r.name}-${r.category}`}
                  onSelect={() => go("/app/reminders")}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/15 shrink-0">
                    <Repeat className="h-3.5 w-3.5 text-blue-400" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.category} · {r.frequency} · due {format(new Date(r.next_due_date), "dd MMM")}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 text-muted-foreground">
                    {formatMoney(r.amount, r.currency)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Footer hint */}
      <div className="border-t border-border/40 px-3 py-2 flex items-center gap-3 text-xs text-muted-foreground/60">
        <span><kbd className="px-1 py-0.5 rounded border border-border/60 text-xs">↑↓</kbd> navigate</span>
        <span><kbd className="px-1 py-0.5 rounded border border-border/60 text-xs">↵</kbd> open</span>
        <span><kbd className="px-1 py-0.5 rounded border border-border/60 text-xs">Esc</kbd> close</span>
        <span className="ml-auto">Ctrl+K to open anytime</span>
      </div>
    </CommandDialog>
  );
}
