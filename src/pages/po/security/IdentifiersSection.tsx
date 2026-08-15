import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Hash, Loader2, PenLine, Trash2, UserCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";

/**
 * The alternate PO login identifiers (a user id and a numeric id) — split out
 * of PoSecurity.tsx in Stage 4.13. It owns its own query and mutations against
 * the `po_*_identifiers` RPCs, so the page passes it nothing.
 */
/* ══════════════════════════════════════════════════════════════════════════════
   Identifiers sub-section
══════════════════════════════════════════════════════════════════════════════ */

export default function IdentifiersSection() {
  const qc = useQueryClient();

  const [editUserId,   setEditUserId]   = useState(false);
  const [editNumberId, setEditNumberId] = useState(false);
  const [draftUser,   setDraftUser]     = useState("");
  const [draftNumber, setDraftNumber]   = useState("");

  /* load current identifiers */
  const idQ = useQuery({
    queryKey: ["po-identifiers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_get_identifiers");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { poUserId: row?.po_user_id ?? null, poNumberId: row?.po_number_id ?? null } as
        { poUserId: string | null; poNumberId: string | null };
    },
  });

  const saveMut = useMutation({
    mutationFn: async (params: { user_id?: string | null; number_id?: string | null }) => {
      const { error } = await supabase.rpc("po_set_identifiers", {
        p_user_id:   params.user_id   !== undefined ? params.user_id   : null,
        p_number_id: params.number_id !== undefined ? params.number_id : null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["po-identifiers"] });
      if (vars.user_id   !== undefined) { setEditUserId(false);   setDraftUser(""); }
      if (vars.number_id !== undefined) { setEditNumberId(false); setDraftNumber(""); }
      toast.success("Identifier updated.");
    },
    onError: (e) => notifyError(e),
  });

  const current = idQ.data;

  /* validation */
  const userIdValid   = /^[a-zA-Z0-9_-]{3,30}$/.test(draftUser);
  const numberIdValid = /^[0-9]{6,20}$/.test(draftNumber);

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Login Identifiers</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Custom IDs you can use instead of your email when signing in to the Owner Console.
        </p>
      </div>

      {idQ.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── User ID ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <UserCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">User ID</span>
              <span className="text-xs text-muted-foreground">(letters, numbers, _ or -  ·  3–30 chars)</span>
            </div>

            {!editUserId ? (
              <div className="flex items-center gap-2">
                <div className={`flex-1 rounded-lg border px-3 py-2 text-sm font-mono
                  ${current?.poUserId ? "bg-background border-border" : "bg-muted/40 border-dashed border-border/50 text-muted-foreground"}`}>
                  {current?.poUserId ?? "Not set"}
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
                  onClick={() => { setDraftUser(current?.poUserId ?? ""); setEditUserId(true); }}>
                  <PenLine className="h-3.5 w-3.5" />
                  {current?.poUserId ? "Change" : "Set"}
                </Button>
                {current?.poUserId && (
                  <Button size="sm" variant="ghost"
                    className="gap-1.5 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => saveMut.mutate({ user_id: "" })}>
                    {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  value={draftUser}
                  onChange={e => setDraftUser(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30))}
                  placeholder="e.g. finroot_admin"
                  className={`font-mono ${draftUser.length > 0 && !userIdValid ? "border-amber-500/60" : userIdValid ? "border-emerald-500/60" : ""}`}
                  autoFocus
                />
                {draftUser.length > 0 && !userIdValid && (
                  <p className="text-xs text-amber-600">Minimum 3 characters</p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" disabled={!userIdValid || saveMut.isPending}
                    onClick={() => saveMut.mutate({ user_id: draftUser })}>
                    {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => { setEditUserId(false); setDraftUser(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border/40" />

          {/* ── Number ID ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">Number ID</span>
              <span className="text-xs text-muted-foreground">(digits only  ·  6–20 digits)</span>
            </div>

            {!editNumberId ? (
              <div className="flex items-center gap-2">
                <div className={`flex-1 rounded-lg border px-3 py-2 text-sm font-mono tracking-widest
                  ${current?.poNumberId ? "bg-background border-border" : "bg-muted/40 border-dashed border-border/50 text-muted-foreground"}`}>
                  {current?.poNumberId ?? "Not set"}
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
                  onClick={() => { setDraftNumber(current?.poNumberId ?? ""); setEditNumberId(true); }}>
                  <PenLine className="h-3.5 w-3.5" />
                  {current?.poNumberId ? "Change" : "Set"}
                </Button>
                {current?.poNumberId && (
                  <Button size="sm" variant="ghost"
                    className="gap-1.5 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => saveMut.mutate({ number_id: "" })}>
                    {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  inputMode="numeric"
                  value={draftNumber}
                  onChange={e => setDraftNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
                  placeholder="e.g. 100042"
                  className={`font-mono tracking-widest
                    ${draftNumber.length > 0 && !numberIdValid ? "border-amber-500/60" : numberIdValid ? "border-emerald-500/60" : ""}`}
                  autoFocus
                />
                {draftNumber.length > 0 && draftNumber.length < 6 && (
                  <p className="text-xs text-amber-600">Minimum 6 digits ({6 - draftNumber.length} more needed)</p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" disabled={!numberIdValid || saveMut.isPending}
                    onClick={() => saveMut.mutate({ number_id: draftNumber })}>
                    {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => { setEditNumberId(false); setDraftNumber(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* tip */}
          {(current?.poUserId || current?.poNumberId) && (
            <p className="text-xs text-muted-foreground pt-1">
              Use either of these on the PO login screen instead of your email or profile username.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
