import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PdfPasswordError, type ParseOptions } from "@/lib/importParsers";

type Ask = { file: string; wrong: boolean; resolve: (pw: string | null) => void };

/**
 * Asks for a locked PDF's password — a CAS always is — and tries again until
 * it opens or the person cancels. The password is used to open the file in
 * this browser tab only; it is never stored or sent anywhere.
 *
 * `withPassword(parser)` wraps a parser; render `dialog` once.
 */
export function usePdfPassword() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [value, setValue] = useState("");
  const pending = useRef<Ask | null>(null);

  const request = useCallback(
    (file: string, wrong: boolean) =>
      new Promise<string | null>((resolve) => {
        const a = { file, wrong, resolve };
        pending.current = a;
        setValue("");
        setAsk(a);
      }),
    [],
  );

  const close = (pw: string | null) => {
    pending.current?.resolve(pw);
    pending.current = null;
    setAsk(null);
  };

  const withPassword = useCallback(
    <T,>(parser: (f: File, opts?: ParseOptions) => Promise<T>) =>
      async (file: File): Promise<T> => {
        let password: string | undefined;
        for (;;) {
          try {
            return await parser(file, { password });
          } catch (err) {
            if (!(err instanceof PdfPasswordError)) throw err;
            const pw = await request(file.name, err.wrong);
            if (pw === null) throw new Error(`Skipped ${file.name}: no password`);
            password = pw;
          }
        }
      },
    [request],
  );

  const dialog = (
    <Dialog open={ask !== null} onOpenChange={(o) => !o && close(null)}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value) close(value);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>This PDF is locked</DialogTitle>
            <DialogDescription className="break-words">
              {ask?.file} needs a password. A CAMS / KFintech CAS uses the one you set when you
              requested it; an NSDL or CDSL CAS uses your PAN in capitals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pdf-password">Password</Label>
            <PasswordInput
              id="pdf-password"
              autoFocus
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={ask?.wrong || undefined}
            />
            {ask?.wrong && (
              <p className="text-xs text-destructive" role="alert">
                That password didn't open it. Try again.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Used only to open the file here. It isn't saved or sent anywhere.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(null)}>
              Skip file
            </Button>
            <Button type="submit" disabled={!value}>
              Open
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { withPassword, dialog };
}
