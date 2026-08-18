import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The single selection primitive every onboarding-wizard step is built from
 * — both the boxy multi-select "tile" (icon-less version of
 * `pages/po/tenants/ModuleGrid.tsx`'s pill) and the rounded single-select
 * "pill" (`components/transactions/PaymentModeField.tsx`'s chip). One
 * component so every step in the wizard behaves and looks identical.
 */
export function SelectableTile({
  label,
  active,
  onClick,
  disabled,
  variant = "tile",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Greys out an unselected option (e.g. a max-3 cap already reached) without blocking deselecting an active one. */
  disabled?: boolean;
  variant?: "tile" | "pill";
}) {
  const blocked = disabled && !active;

  if (variant === "pill") {
    return (
      <button
        type="button"
        aria-pressed={active}
        disabled={blocked}
        onClick={onClick}
        className={cn(
          "px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors",
          active
            ? "border-primary/60 bg-primary/10 text-primary"
            : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
          blocked && "opacity-40 cursor-not-allowed hover:border-border/50 hover:text-muted-foreground",
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={blocked}
      onClick={onClick}
      className={cn(
        "relative flex min-h-[3rem] items-center justify-center rounded-xl border px-3 py-3 text-center text-sm font-medium transition-all",
        active
          ? "border-primary/60 bg-primary/10 text-primary shadow-sm"
          : "border-border/40 bg-muted/10 text-muted-foreground hover:border-border/70 hover:bg-muted/30 hover:text-foreground",
        blocked && "opacity-40 cursor-not-allowed hover:border-border/40 hover:bg-muted/10 hover:text-muted-foreground",
      )}
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full transition-all",
          active ? "scale-100 bg-primary opacity-100" : "scale-75 opacity-0",
        )}
      >
        <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
      </span>
    </button>
  );
}
