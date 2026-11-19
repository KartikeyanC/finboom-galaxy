import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, HandCoins, Wallet, PieChart, MoreHorizontal, Lock, Plus, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNavSections } from "@/components/AppSidebar";
import { cn } from "@/lib/utils";

/**
 * Phones only (below md): a floating pill dock — two tabs, the gradient
 * quick-add button in the centre, two tabs, and "More", which opens a sheet of
 * tiles for every other page. The desktop sidebar takes over from 768px.
 *
 * The four tabs are fixed destinations, but they still go through
 * useNavSections(), so a member who cannot see Budget never gets a tab for it.
 */
const TABS = [
  { url: "/app", label: "Home", icon: LayoutDashboard },
  { url: "/app/expenses", label: "Expenses", icon: HandCoins },
  { url: "/app/income", label: "Income", icon: Wallet },
  { url: "/app/budget", label: "Budget", icon: PieChart },
];


/** Fields where the on-screen keyboard is up and a form's own buttons matter more than quick add. */
const TYPING_FIELD =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]), textarea, select, [contenteditable="true"]';

/**
 * True while a field inside the page is focused. The dock steps aside then,
 * so it never sits on top of the form's own Save / Add button.
 */
function useTypingInPage() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = document.activeElement;
      setTyping(!!el && el.matches(TYPING_FIELD) && !!el.closest("#main-content"));
    };
    // focusout fires before focus lands on the next element; read it a tick later.
    const later = () => setTimeout(check, 0);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return typing;
}

export function MobileNav({ onQuickAdd, onSearch }: { onQuickAdd: () => void; onSearch: () => void }) {
  const { pathname } = useLocation();
  const [sheet, setSheet] = useState(false);
  const typing = useTypingInPage();
  const { main, wealth, tools } = useNavSections();
  const all = [...main, ...wealth, ...tools];
  const visible = new Set(all.map(({ item }) => item.url));
  const tabs = TABS.filter((t) => visible.has(t.url));
  const more = all.filter(({ item }) => !tabs.some((t) => t.url === item.url));
  const inMore = more.find(({ item }) => item.url === pathname);

  // Each item is a circle wrapped in a thick dark ring; neighbouring rings
  // overlap, which draws the scalloped dock outline without any SVG.
  const item = (active: boolean) =>
    cn(
      "relative h-12 w-12 shrink-0 rounded-full ring-[5px] ring-[#0c0c0e] inline-flex items-center justify-center transition duration-200 ease-out active:scale-95 motion-reduce:transition-none",
      active ? "bg-white text-[#0c0c0e]" : "bg-[#232327] text-white/60 hover:text-white",
    );

  return (
    <>
      <nav
        aria-label="Tabs"
        className={cn(
          "md:hidden fixed inset-x-0 z-30 flex justify-center pointer-events-none transition duration-200 ease-out motion-reduce:transition-none",
          typing && "opacity-0 translate-y-6",
        )}
        style={{ bottom: "calc(0.875rem + env(safe-area-inset-bottom))" }}
        aria-hidden={typing || undefined}
      >
        <div className="pointer-events-auto flex items-center gap-1.5 p-[5px] drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)]">
          {tabs.slice(0, 2).map(({ url, label, icon: Icon }) => (
            <Link
              key={url}
              to={url}
              aria-label={label}
              title={label}
              tabIndex={typing ? -1 : undefined}
              aria-current={pathname === url ? "page" : undefined}
              className={item(pathname === url)}
            >
              <Icon className="h-5 w-5" />
            </Link>
          ))}
          <button
            type="button"
            onClick={onQuickAdd}
            aria-label="Quick add transaction"
            tabIndex={typing ? -1 : undefined}
            className="relative h-12 w-12 shrink-0 rounded-full ring-[5px] ring-[#0c0c0e] bg-gradient-to-br from-brand-a to-brand-b text-brand-foreground inline-flex items-center justify-center transition duration-200 ease-out active:scale-95 hover:scale-105 motion-reduce:transition-none"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
          {tabs.slice(2).map(({ url, label, icon: Icon }) => (
            <Link
              key={url}
              to={url}
              aria-label={label}
              title={label}
              tabIndex={typing ? -1 : undefined}
              aria-current={pathname === url ? "page" : undefined}
              className={item(pathname === url)}
            >
              <Icon className="h-5 w-5" />
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-label={inMore ? `More (${inMore.item.title})` : "More"}
            aria-expanded={sheet}
            aria-haspopup="dialog"
            tabIndex={typing ? -1 : undefined}
            className={item(!!inMore || sheet)}
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </nav>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="md:hidden p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <SheetHeader className="mb-3 text-left">
            <SheetTitle className="text-base">More</SheetTitle>
          </SheetHeader>
          <button
            type="button"
            onClick={() => {
              setSheet(false);
              onSearch();
            }}
            className="w-full h-11 mb-3 rounded-full border border-border bg-background px-4 inline-flex items-center gap-2.5 text-sm text-faint"
          >
            <Search className="h-4 w-4" /> Search anything…
          </button>
          <div className="grid grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto">
            {more.map(({ item, lock }) => {
              const active = pathname === item.url;
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  onClick={() => setSheet(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 px-1 text-center text-xs font-semibold transition active:scale-95",
                    active ? "bg-accent text-primary" : "bg-background text-foreground",
                    lock.kind === "plan" && "text-faint",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.title}
                  {lock.kind === "plan" && (
                    <>
                      <Lock className="absolute top-2 right-2 h-3 w-3" aria-hidden />
                      <span className="sr-only">not included in your plan</span>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
