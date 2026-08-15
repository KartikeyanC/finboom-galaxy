import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ExternalLink, Save, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import {
  DEFAULT_NOTICE,
  STATE_LABEL,
  STATE_TONE,
  STATUS_KEY,
  normalizeStatusNotice,
  relativeTime,
  type NoticeState,
  type StatusNotice,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const STATES: NoticeState[] = ["operational", "maintenance", "degraded", "outage"];

/**
 * Stage 5.7 — the operator's half of `/status`.
 *
 * The live probes on the status page can only see what a browser can reach.
 * Everything else — a data problem, a provider incident, planned maintenance —
 * has to be said out loud by a person, and this is where they say it. It writes
 * one `site_settings` row through the audited PO RPC; no migration, and the
 * `landing_` prefix is what makes it readable by a signed-out visitor.
 */
export default function PoStatus() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StatusNotice>(DEFAULT_NOTICE);
  const [saving, setSaving] = useState(false);

  const { data: stored, isLoading } = useQuery({
    queryKey: ["po-status-notice"],
    queryFn: async (): Promise<StatusNotice> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", STATUS_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeStatusNotice(data?.value ?? null);
    },
  });

  useEffect(() => {
    if (stored) setDraft(stored);
  }, [stored]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored ?? DEFAULT_NOTICE);

  const save = async () => {
    setSaving(true);
    const payload: StatusNotice = {
      ...draft,
      headline: draft.headline.trim(),
      detail: draft.detail.trim(),
      // Stamped here rather than in the browser reading it: "updated 2 minutes
      // ago" is the most load-bearing line on a status page during an incident.
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.rpc("po_set_site_setting", {
      p_key: STATUS_KEY,
      p_value: payload as unknown as Json,
    });
    setSaving(false);
    if (error) return notifyError(error);
    setDraft(payload);
    qc.invalidateQueries({ queryKey: ["po-status-notice"] });
    qc.invalidateQueries({ queryKey: ["status-notice"] });
    toast.success("Status updated — live on /status");
  };

  const clear = () =>
    setDraft({ state: "operational", headline: "", detail: "", updated_at: draft.updated_at });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">FinRoot · Owner console</p>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Status page
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            What visitors see at <code>/status</code> on top of the live checks. Leave the headline
            empty when nothing is wrong — an empty notice reads as “nothing is being reported”,
            which is the honest default.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href="/status" target="_blank" rel="noreferrer">
            <ExternalLink className="w-3.5 h-3.5" /> Open /status
          </a>
        </Button>
      </div>

      <div className="glass-card p-6 space-y-5 max-w-2xl">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">State</Label>
          <div className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={draft.state === s}
                onClick={() => setDraft((d) => ({ ...d, state: s }))}
                className={cn(
                  "h-9 px-3.5 rounded-lg border text-sm transition-colors",
                  draft.state === s ? STATE_TONE[s] : "border-border/50 text-muted-foreground hover:bg-accent/30",
                )}
              >
                {STATE_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            The page shows whichever is worse — this, or what the live checks find. A green notice
            never hides a failing probe.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status-headline">Headline</Label>
          <Input
            id="status-headline"
            value={draft.headline}
            maxLength={120}
            placeholder="e.g. Investments prices are delayed"
            onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            One line, in the user's terms — what they cannot do, not which component failed.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status-detail">Detail</Label>
          <Textarea
            id="status-detail"
            rows={4}
            value={draft.detail}
            maxLength={1000}
            placeholder="What is affected, what still works, and when you will next update this."
            onChange={(e) => setDraft((d) => ({ ...d, detail: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={save} disabled={saving || isLoading || !dirty} className="gap-1.5">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Publish"}
          </Button>
          <Button variant="ghost" onClick={clear} disabled={!draft.headline && draft.state === "operational"} className="gap-1.5">
            <Undo2 className="w-4 h-4" /> Clear the notice
          </Button>
          {stored?.updated_at && (
            <span className="text-xs text-muted-foreground ml-auto">
              Last published {relativeTime(stored.updated_at)}
            </span>
          )}
        </div>
      </div>

      <div className="glass-card p-5 max-w-2xl">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Preview</p>
        <div className={cn("rounded-xl border p-4", STATE_TONE[draft.state])}>
          <p className="font-semibold">{draft.headline || "All systems operational"}</p>
          {draft.detail && <p className="text-sm mt-1 whitespace-pre-line opacity-90">{draft.detail}</p>}
        </div>
      </div>
    </div>
  );
}
