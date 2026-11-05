/**
 * BUG-020 — getting an invitation link to the person it is for.
 *
 * `send-email` is deliberately not deployed (BUG-005), so FinRoot does not
 * send the mail itself. These build the message and hand it to the inviter's
 * own mail app, WhatsApp, or the system share sheet — the invite then comes
 * from someone the invitee knows, which is also the more trustworthy sender.
 */

export type InviteShare = {
  email: string;
  link: string;
  role: string;
  workspace?: string | null;
  expiresAt?: string | null;
};

const ROLE_WORDS: Record<string, string> = {
  admin: "add and edit entries",
  viewer: "view",
};

export function inviteSubject(s: InviteShare): string {
  return s.workspace ? `Join "${s.workspace}" on FinRoot` : "Join my workspace on FinRoot";
}

export function inviteMessage(s: InviteShare): string {
  const where = s.workspace ? `"${s.workspace}"` : "my workspace";
  const can = ROLE_WORDS[s.role] ?? "use";
  const until = s.expiresAt ? expiryText(s.expiresAt) : "in 14 days";
  return [
    `I've invited you to ${where} on FinRoot, where you'll be able to ${can} our finances.`,
    "",
    `Open this link to join: ${s.link}`,
    "",
    `If you don't have a FinRoot account yet, sign up with ${s.email} — the invitation only works for that address. It expires ${until}.`,
  ].join("\n");
}

export function mailtoHref(s: InviteShare): string {
  return (
    `mailto:${encodeURIComponent(s.email)}` +
    `?subject=${encodeURIComponent(inviteSubject(s))}` +
    `&body=${encodeURIComponent(inviteMessage(s))}`
  );
}

export function whatsappHref(s: InviteShare): string {
  return `https://wa.me/?text=${encodeURIComponent(inviteMessage(s))}`;
}

function expiryText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "in 14 days";
  return `on ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Days until `iso`, rounded up; negative once it has passed. */
export function daysLeft(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

/** Query key for a workspace's unused invitations (PendingInvites). */
export const invitesKey = (tenantId: string | null) => ["invitations", tenantId] as const;
