import { useEffect, useRef } from "react";
import { Copy, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  inviteMessage,
  inviteSubject,
  mailtoHref,
  whatsappHref,
  type InviteShare,
} from "@/lib/inviteShare";

/**
 * BUG-020 — the link IS the invitation, and it is shown once: only its hash is
 * stored, so it can never be read back. FinRoot does not send mail itself
 * (BUG-005), so this hands the message to the inviter's own apps.
 */
export default function InviteLinkPanel({
  invite,
  onDone,
}: {
  invite: InviteShare;
  onDone: () => void;
}) {
  // "New link" in the pending list opens this further up the page.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [invite.link]);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.link);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed — select the link and copy it manually");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: inviteSubject(invite), text: inviteMessage(invite) });
    } catch {
      /* dismissed */
    }
  };

  return (
    <div ref={ref} className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3" role="region" aria-label="Invitation link">
      <div>
        <div className="text-xs font-semibold text-foreground">
          Send this invitation to {invite.email}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          It works whether or not they have an account yet, and only for that email address.
          This is the only time the link can be shown — if it gets lost, make a new one from
          Pending invitations below.
        </p>
      </div>
      <code className="block break-all rounded bg-background/70 px-2 py-1.5 text-xs">{invite.link}</code>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild className="gap-1.5">
          <a href={mailtoHref(invite)}>
            <Mail className="h-3.5 w-3.5" /> Email it
          </a>
        </Button>
        <Button size="sm" variant="outline" asChild className="gap-1.5">
          <a href={whatsappHref(invite)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </Button>
        {canShare && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={share}>
            <Share2 className="h-3.5 w-3.5" /> Share…
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={copy}>
          <Copy className="h-3.5 w-3.5" /> Copy link
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
