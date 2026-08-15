import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  RefreshCw,
  Copy,
  ShieldOff,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  Check,
  PenLine,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import ChangePasswordSection from "./security/ChangePasswordSection";
import IdentifiersSection from "./security/IdentifiersSection";
import { fmt, generateSecret } from "./security/secretFormat";

type Mode = "generate" | "manual";

export default function PoSecurity() {
  const qc = useQueryClient();

  const [mode, setMode]         = useState<Mode | null>(null); // null = panel closed
  const [pending, setPending]   = useState("");                 // the 16-digit code
  const [manual, setManual]     = useState("");                 // raw typed input
  const [show, setShow]         = useState(false);
  const [copied, setCopied]     = useState(false);
  const [savedAck, setSavedAck] = useState(false);          // "I've saved it" confirmation

  /* ── queries / mutations ── */

  const hasQ = useQuery({
    queryKey: ["po-has-secret"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_has_secret");
      if (error) throw error;
      return data as boolean;
    },
  });

  const saveMut = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.rpc("po_set_secret", { p_secret: code });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["po-has-secret"] });
      closePanel();
      toast.success("Secret access code saved. Keep it somewhere safe.");
    },
    onError: (e) => notifyError(e),
  });

  const revokeMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("po_revoke_secret");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["po-has-secret"] });
      closePanel();
      toast.success("Secret access code revoked.");
    },
    onError: (e) => notifyError(e),
  });

  /* ── helpers ── */

  const closePanel = () => {
    setMode(null);
    setPending("");
    setManual("");
    setShow(false);
    setSavedAck(false);
  };

  const openGenerate = () => {
    setMode("generate");
    setPending(generateSecret());
    setShow(true);
    setManual("");
    setSavedAck(false);
  };

  const openManual = () => {
    setMode("manual");
    setPending("");
    setManual("");
    setShow(false);
    setSavedAck(false);
  };

  const handleManualChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    setManual(digits);
    setPending(digits);
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const manualComplete = manual.length === 16;
  const hasSecret      = hasQ.data ?? false;

  /* ── render ── */

  return (
    <div className="p-6 max-w-2xl space-y-6">

      {/* header */}
      <div>
        <h1 className="font-display text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your 16-digit Secret Access Code — an alternative to your
          password for signing into the Owner Console.
        </p>
      </div>

      {/* ── status card ── */}
      <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-5 space-y-5">

        {/* status row */}
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center
            ${hasSecret ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
            {hasSecret ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
          </div>
          <div>
            <div className="font-medium text-sm">
              {hasSecret ? "Secret code is active" : "No secret code set"}
            </div>
            <div className="text-xs text-muted-foreground">
              {hasSecret
                ? "You can sign in using your identifier + secret code."
                : "Set a code to enable secret-based sign-in."}
            </div>
          </div>
        </div>

        {/* action buttons */}
        <div className="flex gap-2 flex-wrap">

          {/* Generate */}
          <Button
            size="sm"
            variant={hasSecret ? "outline" : "default"}
            className="gap-2"
            onClick={openGenerate}
          >
            <RefreshCw className="h-4 w-4" />
            {hasSecret ? "Rotate secret code" : "Generate secret code"}
          </Button>

          {/* Enter my own */}
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={openManual}
          >
            <PenLine className="h-4 w-4" />
            Enter my own code
          </Button>

          {/* Revoke */}
          {hasSecret && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost"
                  className="gap-2 text-destructive hover:text-destructive">
                  <ShieldOff className="h-4 w-4" />
                  Revoke
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke secret access code?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Secret-based sign-in will stop working immediately.
                    You can set a new code at any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => revokeMut.mutate()}
                  >
                    {revokeMut.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : "Revoke"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* ── panel: GENERATE mode ── */}
      {mode === "generate" && (
        <div className="rounded-xl border border-[#A07E2A]/40 bg-[#A07E2A]/06 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-[#A07E2A]" />
            <span>Your new secret access code</span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Copy this code now — once you save and leave this page it won't be shown again.
          </p>

          {/* code display */}
          <div className="relative">
            <Input
              readOnly
              value={show ? fmt(pending) : "•••• •••• •••• ••••"}
              className="font-mono text-xl tracking-widest text-center pr-20 h-12 bg-background"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8"
                onClick={() => setShow(v => !v)} title={show ? "Hide" : "Reveal"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8"
                onClick={() => copyCode(pending)} title="Copy">
                {copied
                  ? <Check className="h-4 w-4 text-emerald-500" />
                  : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* save acknowledgement */}
          <label className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/40 p-3 cursor-pointer">
            <Checkbox checked={savedAck} onCheckedChange={(v) => setSavedAck(v === true)} className="mt-0.5" />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I've revealed and <span className="text-foreground font-medium">copied this code somewhere safe</span>.
              I understand it can never be shown again after I save.
            </span>
          </label>

          <div className="flex gap-2 pt-1 flex-wrap">
            <Button size="sm" variant="outline" className="gap-2"
              onClick={() => { setPending(generateSecret()); setShow(true); setSavedAck(false); }}>
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </Button>
            <Button size="sm" className="gap-2"
              onClick={() => saveMut.mutate(pending)}
              disabled={saveMut.isPending || !savedAck}>
              {saveMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ShieldCheck className="h-4 w-4" />}
              Save &amp; activate
            </Button>
            <Button size="sm" variant="ghost" onClick={closePanel}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── panel: MANUAL mode ── */}
      {mode === "manual" && (
        <div className="rounded-xl border border-[#A07E2A]/40 bg-[#A07E2A]/06 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <PenLine className="h-4 w-4 text-[#A07E2A]" />
            <span>Enter your own 16-digit code</span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Type exactly 16 digits (0–9). Choose something memorable but not guessable
            — avoid sequences like <em>1234…</em> or repeated digits.
          </p>

          {/* manual input */}
          <div className="space-y-1.5">
            <Label htmlFor="manual-code" className="text-xs text-muted-foreground">
              Your code ({manual.length}/16 digits)
            </Label>
            <div className="relative">
              <Input
                id="manual-code"
                inputMode="numeric"
                type={show ? "text" : "password"}
                value={show ? fmt(manual) : manual}
                onChange={e => handleManualChange(e.target.value)}
                placeholder="Enter 16 digits"
                className={`font-mono text-xl tracking-widest text-center pr-20 h-12 bg-background
                  ${manualComplete ? "border-emerald-500/60 focus-visible:ring-emerald-500/30" : ""}
                  ${manual.length > 0 && !manualComplete ? "border-amber-500/60" : ""}`}
                maxLength={19} // 16 digits + 3 spaces when shown
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8"
                  onClick={() => setShow(v => !v)} title={show ? "Hide" : "Reveal"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                {manualComplete && (
                  <Button size="icon" variant="ghost" className="h-8 w-8"
                    onClick={() => copyCode(manual)} title="Copy">
                    {copied
                      ? <Check className="h-4 w-4 text-emerald-500" />
                      : <Copy className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>

            {/* progress dots */}
            <div className="flex gap-1 justify-center pt-1">
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors
                    ${i < manual.length ? "bg-[#A07E2A]" : "bg-border"}`}
                />
              ))}
            </div>

            {manual.length > 0 && !manualComplete && (
              <p className="text-xs text-amber-600 text-center">
                {16 - manual.length} more digit{16 - manual.length !== 1 ? "s" : ""} needed
              </p>
            )}
            {manualComplete && (
              <p className="text-xs text-emerald-600 text-center flex items-center justify-center gap-1">
                <Check className="h-3 w-3" /> Ready to save
              </p>
            )}
          </div>

          {/* save acknowledgement */}
          <label className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/40 p-3 cursor-pointer">
            <Checkbox
              checked={savedAck}
              onCheckedChange={(v) => setSavedAck(v === true)}
              disabled={!manualComplete}
              className="mt-0.5"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I've <span className="text-foreground font-medium">written this code down somewhere safe</span>.
              I understand it can never be shown again after I save.
            </span>
          </label>

          <div className="flex gap-2 pt-1 flex-wrap">
            <Button size="sm" className="gap-2"
              onClick={() => saveMut.mutate(manual)}
              disabled={!manualComplete || !savedAck || saveMut.isPending}>
              {saveMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ShieldCheck className="h-4 w-4" />}
              Save &amp; activate
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={openGenerate}>
              <RefreshCw className="h-3.5 w-3.5" /> Generate one instead
            </Button>
            <Button size="sm" variant="ghost" onClick={closePanel}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Change password (via secret) ── */}
      <ChangePasswordSection hasSecret={hasSecret} />

      {/* ── Login Identifiers ── */}
      <IdentifiersSection />

      {/* info box */}
      <div className="rounded-xl border border-border/40 bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>On the PO login screen, click <em>"Use 16-digit secret access code"</em>.</li>
          <li>Enter any of your identifiers (email / User ID / Number ID) + the secret code.</li>
          <li>The secret is stored as a bcrypt hash — the plain digits are never saved.</li>
          <li>Rotate or revoke anytime; the old code becomes invalid immediately.</li>
        </ul>
      </div>
    </div>
  );
}
