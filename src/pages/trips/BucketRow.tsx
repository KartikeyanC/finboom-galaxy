import { ChevronDown, ChevronRight } from "lucide-react";
import { MoneyInput } from "@/components/ui/money-input";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/tripsStore";
import { BUCKET_META, type StoredAccount, type TripBucket } from "@/lib/accountsStore";
import { BUCKET_ICON, BUCKET_ROW_TITLE, bucketGradient } from "./tripMeta";

/**
 * One payment-bucket row in the trip allocation editor, plus the per-account
 * amount input it renders. Split out of Trips.tsx in Stage 4.13 — together they
 * are a self-contained editor that the page only needs to hand accounts and a
 * change callback.
 */

export function BucketRow({
  bucket,
  open,
  onToggle,
  accounts,
  alloc,
  onChange,
}: {
  bucket: TripBucket;
  open: boolean;
  onToggle: () => void;
  accounts: StoredAccount[];
  alloc: Record<string, number>;
  onChange: (id: string, v: number) => void;
}) {
  const Icon = BUCKET_ICON[bucket];
  const rowTotal = accounts.reduce((s, a) => s + (alloc[a.id] || 0), 0);
  const active = rowTotal > 0;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        active ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card/30",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white shrink-0"
            style={bucketGradient(bucket)}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">{BUCKET_ROW_TITLE[bucket]}</div>
            <div className="text-xs text-muted-foreground">
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"} ·{" "}
              {rowTotal > 0 ? `₹${formatINR(rowTotal)} allocated` : "tap to fund"}
            </div>
          </div>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2">
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              No {BUCKET_META[bucket].label.toLowerCase()} accounts yet. Add one from{" "}
              <span className="text-primary font-medium">Accounts & Wallets</span> to fund
              trips from this source.
            </div>
          ) : (
            accounts.map((a) => (
              <AccountAllocationInput
                key={a.id}
                account={a}
                bucket={bucket}
                value={alloc[a.id] || 0}
                onChange={(v) => onChange(a.id, v)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function AccountAllocationInput({
  account,
  bucket,
  value,
  onChange,
}: {
  account: StoredAccount;
  bucket: TripBucket;
  value: number;
  onChange: (v: number) => void;
}) {
  const filled = value > 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card/60 p-2 pl-3 transition-all",
        filled ? "border-primary/40 ring-1 ring-primary/30" : "border-border/40",
      )}
    >
      <div
        className="h-8 w-8 rounded-md flex items-center justify-center text-white shrink-0"
        style={bucketGradient(bucket)}
      >
        <span className="text-xs font-semibold">
          {(account.name || "?").charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{account.name || "Account"}</div>
        <div className="text-xs text-muted-foreground truncate">
          {account.bank || BUCKET_META[bucket].label}
          {account.last4 ? ` · •••• ${account.last4}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">₹</span>
        <MoneyInput
          value={value || ""}
          onValueChange={(n) => onChange(n ?? 0)}
          placeholder="0"
          className="h-9 w-28 text-right font-display"
        />
      </div>
    </div>
  );
}

/* ============================================================
   Trip workspace
   ============================================================ */
