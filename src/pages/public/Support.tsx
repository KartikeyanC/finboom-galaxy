import { Link } from "react-router-dom";
import { Mail, LifeBuoy, Activity, FileDown, ShieldQuestion } from "lucide-react";
import PublicLayout, { Section } from "@/pages/public/PublicLayout";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useBranding } from "@/hooks/useBranding";
import {
  SUPPORT_EMAIL,
  SUPPORT_RESPONSE,
  buildStamp,
  supportDiagnostics,
  supportMailto,
} from "@/lib/support";

/**
 * Stage 5.7 — how a person reaches a person.
 *
 * Public, and deliberately not behind the app: somebody who cannot sign in is
 * exactly the person most likely to need this page. When they are signed in it
 * fills in the details that make a reply possible, and shows them what it is
 * about to send — nothing here is collected or transmitted by the app; their
 * own mail client sends whatever they choose to send.
 */
export default function Support() {
  const { appName } = useBranding();
  const { user } = useAuth();
  const { current } = useTenant();
  const { data: sub } = useSubscription();

  const context = {
    email: user?.email ?? null,
    userId: user?.id ?? null,
    workspaceId: current?.tenantId ?? null,
    workspaceName: current?.name ?? null,
    planName: sub?.plan_name ?? null,
    path: typeof window !== "undefined" ? window.location.pathname : null,
    build: buildStamp(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  };
  const diagnostics = supportDiagnostics(context);

  return (
    <PublicLayout
      eyebrow="Support"
      title="Get help"
      summary={`Something not working, or not making sense? Write to us. ${appName} is a small team — you will be talking to the person who wrote the code.`}
      meta={SUPPORT_RESPONSE}
    >
      <Section id="contact" heading="Email us">
        <p>
          <a
            className="text-[#19B886] hover:underline text-base font-medium"
            href={supportMailto({ subject: `${appName} support`, context })}
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p>
          Opening that link starts a mail with the details below already written in — you can read
          and edit every line before you send it.
        </p>
        <a
          href={supportMailto({ subject: `${appName} support`, context })}
          className="inline-flex items-center gap-2 rounded-lg border border-[#19B886]/40 bg-[#19B886]/10 px-4 py-2.5 text-sm font-medium text-[#19B886] hover:bg-[#19B886]/20 transition-colors"
        >
          <Mail className="w-4 h-4" /> Write to support
        </a>
      </Section>

      <Section id="details" heading="What to include">
        <p>
          Three things answer most questions on the first reply: <strong>what you did</strong>,{" "}
          <strong>what you expected</strong>, and <strong>what happened instead</strong>. A
          screenshot helps. Exact figures are not needed — do not paste account numbers.
        </p>
        {diagnostics ? (
          <>
            <p>We would also like these, and the mail link fills them in for you:</p>
            <pre className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs overflow-x-auto whitespace-pre-wrap">
              {diagnostics}
            </pre>
          </>
        ) : (
          <p className="text-[#8b9a94]">
            You are signed out, so there is nothing to fill in automatically. If the problem is
            inside your account, mention the email address you sign in with.
          </p>
        )}
      </Section>

      <Section id="first" heading="Worth checking first">
        <ul className="space-y-2.5">
          <li className="flex gap-2.5">
            <Activity className="w-4 h-4 mt-0.5 shrink-0 text-[#19B886]" />
            <span>
              <Link to="/status" className="text-[#19B886] hover:underline">Status</Link> — whether
              it is us or your connection, checked live from your own browser.
            </span>
          </li>
          <li className="flex gap-2.5">
            <ShieldQuestion className="w-4 h-4 mt-0.5 shrink-0 text-[#19B886]" />
            <span>
              Locked out of the app? The lock screen has a <strong>Forgot your PIN?</strong> link —
              your account password resets it. The PIN is stored only on your device and nobody can
              look it up.
            </span>
          </li>
          <li className="flex gap-2.5">
            <FileDown className="w-4 h-4 mt-0.5 shrink-0 text-[#19B886]" />
            <span>
              Want your records out? Settings → Your data exports everything as one file, without
              asking us.
            </span>
          </li>
          <li className="flex gap-2.5">
            <LifeBuoy className="w-4 h-4 mt-0.5 shrink-0 text-[#19B886]" />
            <span>
              Privacy, deletion or a data-rights request? Same address — say so in the subject and
              it goes to the top of the pile. See the{" "}
              <Link to="/privacy" className="text-[#19B886] hover:underline">Privacy Policy</Link>.
            </span>
          </li>
        </ul>
      </Section>

      <Section id="expect" heading="What to expect">
        <p>{SUPPORT_RESPONSE}</p>
        <p>
          There is no phone line and no live chat, and we will never ask you for your password, your
          PIN or a one-time code. Nobody from {appName} needs any of them.
        </p>
      </Section>
    </PublicLayout>
  );
}
