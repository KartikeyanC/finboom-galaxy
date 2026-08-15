import { useEffect, useMemo, useState } from "react";
import { CreditCard, Download, Loader2, RefreshCcw, ShieldCheck, XCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { contactUpgradeHref } from "@/lib/payments";
import { formatPlanPrice } from "@/lib/pricing";
import { usePaymentsGateway } from "@/hooks/usePaymentsGateway";
import { usePlansCatalogue } from "@/hooks/usePricingContent";

// Paddle.js is loaded on demand; minimal typing for the global.
declare global {
  interface Window {
    Paddle?: {
      Environment?: { set: (e: string) => void };
      Initialize: (opts: { token: string }) => void;
      Checkout: { open: (opts: Record<string, unknown>) => void };
    };
  }
}

type UpgradePlan = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  paddle_price_id: string;
};
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";

type Subscription = {
  id: string;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
  plan_name: string | null;
  status: string;
  currency: string | null;
  unit_amount: number | null;
  billing_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
};

type PaddleTxn = {
  id: string;
  status: string;
  invoice_number?: string | null;
  billed_at?: string | null;
  created_at: string;
  currency_code: string;
  details?: { totals?: { grand_total?: string } };
};

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

function formatPaddleTotal(t: PaddleTxn) {
  const raw = t.details?.totals?.grand_total;
  if (!raw) return "—";
  const n = Number(raw) / 100;
  return formatMoney(n, t.currency_code);
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

const STATUS_VARIANT: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  trialing: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
  past_due: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  paused: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  canceled: "bg-destructive/15 text-destructive border border-destructive/30",
  inactive: "bg-muted text-muted-foreground border border-border/40",
};

const TXN_STATUS_VARIANT: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  paid: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  billed: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  past_due: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  canceled: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function BillingPage() {
  const { user } = useAuth();
  const { currentTenantId, memberships } = useTenant();
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [transactions, setTransactions] = useState<PaddleTxn[]>([]);
  const [plans, setPlans] = useState<UpgradePlan[]>([]);
  const [paddleReady, setPaddleReady] = useState(false);
  // With no gateway configured, upgrades are manual (provider='manual', assigned
  // from /po/tenants). `upgradeable_plans()` returns nothing in that case since
  // it requires a paddle_price_id, so fall back to the plain catalogue and offer
  // a way to ask a human instead of rendering a checkout that cannot open.
  const gateway = usePaymentsGateway();
  const gatewayLive = gateway.ready;
  const { data: catalogue } = usePlansCatalogue();
  const currentWorkspaceName =
    memberships.find((m) => m.tenantId === currentTenantId)?.name ?? null;
  // Role for the ACTIVE workspace, as billing-api resolved it. Hiding the
  // buttons is courtesy only — the function enforces the same rule.
  const [role, setRole] = useState<string | null>(null);
  const isOwner = role === "owner";

  // Load upgradeable plans (only those mapped to a Paddle price).
  useEffect(() => {
    supabase.rpc("upgradeable_plans").then(({ data }) => {
      if (Array.isArray(data)) setPlans(data as UpgradePlan[]);
    });
  }, []);

  // Load + initialize Paddle.js (no-op if the client token isn't configured).
  useEffect(() => {
    const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
    if (!token) return;
    const init = () => {
      try {
        window.Paddle?.Environment?.set(token.startsWith("live_") ? "production" : "sandbox");
        window.Paddle?.Initialize({ token });
        setPaddleReady(true);
      } catch {
        /* ignore */
      }
    };
    if (window.Paddle) return init();
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.async = true;
    s.onload = init;
    document.body.appendChild(s);
  }, []);

  const openCheckout = (plan: UpgradePlan) => {
    if (!paddleReady || !window.Paddle) {
      toast.error("Checkout is not available", { description: "Payment provider is not configured yet." });
      return;
    }
    window.Paddle.Checkout.open({
      items: [{ priceId: plan.paddle_price_id, quantity: 1 }],
      customer: user?.email ? { email: user.email } : undefined,
      customData: { user_id: user?.id, tenant_id: currentTenantId },
      settings: { displayMode: "overlay", theme: "dark", successUrl: `${window.location.origin}/app/billing` },
    });
  };

  const load = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    // The workspace is always explicit: billing-api refuses to guess which
    // subscription a multi-workspace user means (BUG-023).
    const { data, error } = await supabase.functions.invoke("billing-api", {
      method: "GET",
      headers: { "x-tenant-id": currentTenantId },
    });
    if (error) {
      notifyError(error, { title: "Could not load billing" });
    } else {
      setSubscription(data?.subscription ?? null);
      setTransactions(data?.transactions ?? []);
      setRole(data?.role ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenantId]);

  const callAction = async (action: "cancel" | "resume") => {
    setActing(action);
    const { error } = await supabase.functions.invoke("billing-api", {
      method: "POST",
      body: { action, tenant_id: currentTenantId },
    });
    setActing(null);
    if (error) {
      notifyError(error, { title: `Could not ${action}` });
      return;
    }
    toast.success(action === "cancel" ? "Cancellation scheduled" : "Subscription resumed");
    await load();
  };

  const downloadInvoice = async (txId: string) => {
    setActing(txId);
    const { data, error } = await supabase.functions.invoke("billing-api", {
      method: "POST",
      body: { action: "invoice_pdf", transaction_id: txId, tenant_id: currentTenantId },
    });
    setActing(null);
    if (error) {
      notifyError(error, { title: "Could not get invoice" });
      return;
    }
    const url = data?.data?.url || data?.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("Invoice URL unavailable");
  };

  const status = subscription?.status ?? "inactive";
  const statusClass = STATUS_VARIANT[status] ?? STATUS_VARIANT.inactive;
  const isActive = ["active", "trialing", "past_due", "paused"].includes(status);
  const scheduledCancel = !!subscription?.cancel_at && status !== "canceled";

  const priceLabel = useMemo(() => {
    if (!subscription?.unit_amount) return null;
    const money = formatMoney(subscription.unit_amount, subscription.currency);
    const interval = subscription.billing_interval ? `/ ${subscription.billing_interval}` : "";
    return `${money} ${interval}`.trim();
  }, [subscription]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1100px] mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
            Account
          </span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
            <CreditCard className="w-7 h-7" /> Billing & Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your subscription and download payment receipts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      <section className="glass-card p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-display text-xl font-semibold text-foreground">
                {subscription?.plan_name ?? "No active plan"}
              </h2>
              <span className={`text-[11px] uppercase tracking-wider px-2 py-1 rounded-md font-semibold ${statusClass}`}>
                {status.replace("_", " ")}
              </span>
            </div>
            {priceLabel && (
              <p className="text-2xl font-display font-bold text-foreground">{priceLabel}</p>
            )}
          </div>

          <div className="flex gap-2">
            {!isActive && (
              <Button asChild>
                <a href="/app/settings">Choose a plan</a>
              </Button>
            )}
            {isActive && !scheduledCancel && isOwner && (
              <Button
                variant="outline"
                onClick={() => callAction("cancel")}
                disabled={acting === "cancel"}
              >
                {acting === "cancel" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )}
                Cancel subscription
              </Button>
            )}
            {scheduledCancel && isOwner && (
              <Button onClick={() => callAction("resume")} disabled={acting === "resume"}>
                {acting === "resume" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCcw className="w-4 h-4 mr-2" />
                )}
                Resume subscription
              </Button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 pt-4 border-t border-border/40">
          <Detail label="Current period" value={
            subscription?.current_period_start
              ? `${formatDate(subscription.current_period_start)} → ${formatDate(subscription.current_period_end)}`
              : "—"
          } />
          <Detail
            label={scheduledCancel ? "Cancels on" : "Next billing date"}
            value={formatDate(scheduledCancel ? subscription?.cancel_at : subscription?.current_period_end)}
          />
          <Detail label="Customer ID" value={subscription?.paddle_customer_id ?? "—"} mono />
        </div>

        {scheduledCancel && (
          <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Your subscription will end on {formatDate(subscription?.cancel_at)}. You'll keep access until then.
            </span>
          </div>
        )}
      </section>

      {gatewayLive && plans.length > 0 && (
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-display font-semibold text-foreground">Plans</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plans.map((p) => {
              const current = subscription?.plan_name === p.name && isActive;
              return (
                <div key={p.id} className="rounded-xl border border-border/60 bg-background/40 p-4 flex flex-col gap-3">
                  <div>
                    <div className="font-display font-semibold text-foreground">{p.name}</div>
                    <div className="text-2xl font-display font-bold mt-1">
                      {formatMoney(p.price_cents / 100, p.currency)}
                      <span className="text-sm text-muted-foreground font-normal"> / {p.interval}</span>
                    </div>
                  </div>
                  <Button
                    className="mt-auto"
                    disabled={current || !paddleReady}
                    onClick={() => openCheckout(p)}
                  >
                    {current ? "Current plan" : `Upgrade to ${p.name}`}
                  </Button>
                </div>
              );
            })}
          </div>
          {!paddleReady && (
            <p className="text-xs text-muted-foreground">Loading secure checkout…</p>
          )}
        </section>
      )}

      {/*
        No gateway configured: upgrades are handled by hand. Say so plainly and
        give a way to ask, rather than showing a dead checkout button — or, as
        before, showing nothing at all, which left a Roots customer with no route
        off the plan now that 2.15 makes the gating real.
      */}
      {!gatewayLive && !gateway.loading && (catalogue?.length ?? 0) > 0 && (
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-display font-semibold text-foreground">Plans</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Self-serve checkout isn't available yet — we set up upgrades by hand. Get in touch and
            we'll switch your workspace over, usually the same day.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(catalogue ?? []).map((p) => {
              const current = subscription?.plan_name === p.name && isActive;
              // Same formatter the landing page uses, so a free tier reads
              // "Free" here too rather than "₹0.00 / month".
              const { price, period } = formatPlanPrice(p);
              return (
                <div key={p.id} className="rounded-xl border border-border/60 bg-background/40 p-4 flex flex-col gap-3">
                  <div>
                    <div className="font-display font-semibold text-foreground">{p.name}</div>
                    <div className="text-2xl font-display font-bold mt-1">
                      {price}
                      {period && (
                        <span className="text-sm text-muted-foreground font-normal"> {period}</span>
                      )}
                    </div>
                  </div>
                  {current ? (
                    <Button className="mt-auto" disabled>
                      Current plan
                    </Button>
                  ) : (
                    <Button asChild className="mt-auto" variant="outline">
                      <a href={contactUpgradeHref(p.name, currentWorkspaceName)}>Contact us</a>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-foreground">Payment history</h2>
          {transactions.length > 0 && (
            <Badge variant="outline" className="text-xs">{transactions.length} records</Badge>
          )}
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading transactions…
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No payments yet. Your invoices will appear here once you're charged.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Receipt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => {
                const st = (t.status || "").toLowerCase();
                const cls = TXN_STATUS_VARIANT[st] ?? "bg-muted text-muted-foreground border-border/40";
                const date = t.billed_at ?? t.created_at;
                const canDownload = ["completed", "paid", "billed"].includes(st);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{formatDate(date)}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {t.invoice_number ?? t.id.slice(-10)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-[11px] uppercase tracking-wider px-2 py-1 rounded-md font-semibold border ${cls}`}>
                        {st.replace("_", " ") || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatPaddleTotal(t)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canDownload || acting === t.id}
                        onClick={() => downloadInvoice(t.id)}
                      >
                        {acting === t.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
      <p className={`text-sm text-foreground mt-1 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}