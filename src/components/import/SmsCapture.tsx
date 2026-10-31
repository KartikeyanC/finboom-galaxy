import { useMemo, useState } from "react";
import { MessageSquareText, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, formatMoney } from "@/lib/finance";
import { parseSmsText, type SmsDraft, type SmsSkipped } from "@/lib/smsParser";
import { useImportTransactions } from "@/hooks/useImportTransactions";

/**
 * Paste bank / UPI messages, review the drafts, save the ones you want.
 *
 * Nothing is read from the phone and nothing is sent anywhere: the text is
 * parsed in this browser (`lib/smsParser.ts`) and only the rows the user keeps
 * go through the same idempotent import as a CSV, so pasting the same message
 * twice does not double-count it.
 */
export function SmsCapture() {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<SmsDraft[]>([]);
  const [skipped, setSkipped] = useState<SmsSkipped[]>([]);
  const [parsed, setParsed] = useState(false);
  const importTxns = useImportTransactions();

  const total = useMemo(
    () => drafts.reduce((s, d) => s + (d.type === "expense" ? -d.amount : d.amount), 0),
    [drafts],
  );

  const read = () => {
    const r = parseSmsText(text);
    setDrafts(r.drafts);
    setSkipped(r.skipped);
    setParsed(true);
  };

  const reset = () => {
    setText("");
    setDrafts([]);
    setSkipped([]);
    setParsed(false);
  };

  const save = async () => {
    try {
      await importTxns.mutateAsync(
        drafts.map((d) => ({
          type: d.type,
          amount: d.amount,
          currency: d.currency,
          category: d.category,
          description: d.merchant || `${d.category} (bank SMS)`,
          // Local noon: the hash keeps only the date, and midnight would slip a
          // day in any timezone east or west of UTC.
          occurred_at: new Date(`${d.date}T12:00:00`).toISOString(),
        })),
      );
      reset();
    } catch {
      /* the hook has already shown the error; keep the drafts for a retry */
    }
  };

  return (
    <Card className="p-6 bg-card/60 backdrop-blur border-border/60 space-y-4">
      <div className="flex items-start gap-3">
        <MessageSquareText className="w-5 h-5 mt-0.5 text-primary" aria-hidden />
        <div>
          <h2 className="font-display text-lg font-bold">Paste bank messages</h2>
          <p className="text-sm text-muted-foreground">
            Copy debit and credit SMS from your phone, paste them here, and review before saving.
            The text is read in your browser and is not uploaded.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sms-text">Messages (separate with a blank line)</Label>
        <Textarea
          id="sms-text"
          rows={6}
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(false); }}
          placeholder={"Rs.250.00 debited from A/c XX1234 to SWIGGY on 12-10-24\n\nINR 85,000 credited to A/c XX1234 on 01-10-24 salary"}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={read} disabled={!text.trim()}>Read messages</Button>
        {(text || parsed) && (
          <Button variant="ghost" onClick={reset}>Clear</Button>
        )}
      </div>

      {parsed && drafts.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          No transactions found. Make sure each message includes an amount (Rs / INR / ₹) and a
          word like debited, credited or spent.
        </p>
      )}

      {drafts.length > 0 && (
        <div className="space-y-3">
          <p role="status" className="text-sm text-muted-foreground">
            {drafts.length} transaction{drafts.length === 1 ? "" : "s"} found · net {formatMoney(total)}.
            Check the category, then save.
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {drafts.map((d) => (
              <li key={d.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={d.type === "expense" ? "destructive" : "secondary"}>
                      {d.type === "expense" ? "Expense" : "Income"}
                    </Badge>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{d.date}</span>
                  </div>
                  <span className="font-display font-bold tabular-nums">{formatMoney(d.amount)}</span>
                </div>
                <div className="text-sm truncate" title={d.raw}>
                  {d.merchant || `${d.category} (bank SMS)`}
                  {d.account && <span className="text-xs text-muted-foreground"> · …{d.account}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={d.category}
                    onValueChange={(category) =>
                      setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, category } : x)))
                    }
                  >
                    <SelectTrigger className="h-9 flex-1" aria-label={`Category for ${d.merchant || "transaction"}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(d.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    aria-label={`Remove ${d.merchant || "transaction"}`}
                    onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button onClick={save} disabled={importTxns.isPending}>
            {importTxns.isPending ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving…</span>
            ) : (
              `Save ${drafts.length} transaction${drafts.length === 1 ? "" : "s"}`
            )}
          </Button>
        </div>
      )}

      {skipped.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {skipped.length} message{skipped.length === 1 ? "" : "s"} skipped
          </summary>
          <ul className="mt-2 space-y-2">
            {skipped.map((s, i) => (
              <li key={i} className="rounded-md border border-border/60 p-2">
                <div className="text-xs font-semibold text-muted-foreground">{s.reason}</div>
                <div className="text-xs break-words">{s.raw}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
