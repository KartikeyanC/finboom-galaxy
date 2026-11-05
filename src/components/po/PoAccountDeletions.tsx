import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notifyError } from "@/lib/errorMessages";
import { toast } from "sonner";

/**
 * Stage 5.2 — the operator's half of account deletion: requests whose 30-day
 * recovery window has ended. The deleting itself is the runbook
 * (docs/runbooks/account-deletion.md: owned workspaces, files, the auth user,
 * with service_role); this lists what is due and records each as done, so a
 * request made in Settings is never left unseen.
 */
export default function PoAccountDeletions() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const due = useQuery({
    queryKey: ["po-account-deletions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_pending_account_deletions");
      if (error) throw error;
      return data ?? [];
    },
  });

  const complete = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.rpc("complete_account_deletion", { p_id: id, p_note: note });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as deleted");
      qc.invalidateQueries({ queryKey: ["po-account-deletions"] });
    },
    onError: (e) => notifyError(e),
  });

  const rows = due.data ?? [];

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <UserX className="h-4 w-4 text-destructive" /> Due account deletions
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Recovery window over. Follow the account-deletion runbook (workspaces, files, sign-in), then mark each done.
      </p>
      {due.isError ? (
        <p className="text-xs text-destructive">Couldn't load deletion requests.</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{due.isLoading ? "Loading…" : "Nothing due."}</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {rows.map((r) => (
            <li key={r.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium break-all">{r.requester_email || r.user_id}</span>
                <span className="text-xs text-muted-foreground">
                  asked {new Date(r.requested_at).toLocaleDateString("en-IN")} · owns {r.owned_tenants} workspace
                  {r.owned_tenants === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label={`What was done for ${r.requester_email || r.user_id}`}
                  placeholder="What was done (e.g. 2 workspaces purged, files drained, auth user deleted)"
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  className="flex-1 min-w-[14rem] h-8 text-xs"
                />
                <Button
                  size="sm"
                  disabled={!(notes[r.id] ?? "").trim() || complete.isPending}
                  onClick={() => complete.mutate({ id: r.id, note: notes[r.id].trim() })}
                >
                  Mark done
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
