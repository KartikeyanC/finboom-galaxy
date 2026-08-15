import { Link } from "react-router-dom";

import { PRIVACY_CONTACT } from "@/lib/legal";
import LegalLayout, { LegalTable, Section } from "./LegalLayout";

/**
 * Stage 5.1 — the privacy policy.
 *
 * Every factual claim here was checked against the system as built, not
 * written from a template: the table of data is the actual set of tables, the
 * retention periods are the rows in `retention_policy`, the third parties are
 * the hosts the edge functions actually call, and the "we don't do this yet"
 * statements are true today. If you change what the product collects, sends or
 * keeps, this file changes in the same commit — and bump LEGAL_VERSION.
 *
 * ⚠️ NOT reviewed by a lawyer. That review is a launch blocker.
 */
export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      summary="What FinRoot stores, why, who else can see it, how long it is kept, and how to get it back or have it deleted."
    >
      <Section id="summary" heading="The short version">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Your financial records are yours. We use them to run the product for you — nothing else.</li>
          <li>We do not sell your data, and we do not share it for advertising.</li>
          <li>There is no analytics or tracking script on this site today, and no advertising cookies.</li>
          <li>Market-price lookups send a security's symbol to our data sources — never your identity or holdings.</li>
          <li>You can export your records at any time, and you can ask us to delete your account.</li>
        </ul>
      </Section>

      <Section id="who" heading="Who we are">
        <p>
          FinRoot is a personal finance tracker operated from India. For any question about this
          policy, or to exercise the rights described below, write to{" "}
          <a className="text-[#19B886] hover:underline" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.
        </p>
        <p className="text-[#8b9a94]">
          The legal entity name, registered address and grievance officer required by India's Digital
          Personal Data Protection Act, 2023 must be filled in here before launch.
        </p>
      </Section>

      <Section id="what" heading="What we store">
        <p>
          Almost everything in FinRoot is data you typed in yourself. We do not buy data about you,
          and we do not connect to your bank.
        </p>
        <LegalTable
          head={["Category", "What it is", "Why we have it"]}
          rows={[
            ["Account", "Email address, password (stored only as a hash by our authentication provider), display name, optional username and mobile number", "To create your account, sign you in and address you by name"],
            ["Your finances", "Transactions, accounts and balances, budgets, goals, investments and holdings, debts, insurance policies, reminders, recurring items, trips, net-worth entries, income streams and tracked subscriptions", "This is the product. It exists so you can see it back."],
            ["Uploaded documents", "Files you attach to an insurance policy", "So the policy record is complete. Stored privately, reachable only from your own workspace."],
            ["Workspace", "Workspace names, membership and roles, and invitations you send (the invitee's email, and a hash of the invite token — never the token itself)", "To let more than one person share a workspace"],
            ["Operational", "An audit log of significant actions, in-app notifications, and your subscription/plan record", "Security, support and billing"],
          ]}
        />
        <p>
          Market-price data is cached by security symbol only (for example <code>RELIANCE.NS</code>).
          That cache contains no personal data and is shared across all users.
        </p>
      </Section>

      <Section id="device" heading="What stays on your device">
        <p>
          Some things never reach our servers at all. Your screen-lock PIN is one of them: it is
          hashed in your browser and the hash is stored locally, so a PIN set on your laptop does not
          exist on your phone — and we cannot read it or recover it for you.
        </p>
        <p>
          The rest is preferences: theme, dashboard layout, whether balances are hidden, which
          workspace you last opened, how much ledger history to load, and the sign-in mechanics for
          that browser. Clearing your browser storage clears all of it and loses nothing but the
          preferences.
        </p>
      </Section>

      <Section id="cookies" heading="Cookies and tracking">
        <p>
          We use no advertising cookies and no third-party tracking scripts. Signing in stores a
          session token in your browser so you stay signed in; that is a functional necessity, not
          analytics.
        </p>
        <p>
          We do not run product analytics in your browser: there is no analytics script, no session
          identifier, and no log of what you click or which screens you visit.
        </p>
        <p>
          We do measure how the product is used, and it is fair that you know how. We count the
          records we already hold for other reasons — how many workspaces exist, how many have
          recorded a transaction, when a workspace was last active — and read those counts as
          totals. That measurement collects nothing new about you, creates no new record of your
          behaviour, and can see nothing you do outside your own account. If we ever start
          collecting something new, this policy will say what it is before it starts.
        </p>
      </Section>

      <Section id="sharing" heading="Who else can see it">
        <p>
          <strong className="text-white">People you invite.</strong> A workspace is shared
          deliberately: anyone you add can see the records in that workspace, at the role you give
          them. Removing a member ends their access immediately.
        </p>
        <p>
          <strong className="text-white">Us.</strong> Staff access is limited to what support and
          operations require, and administrative actions are written to an audit log. Administrators
          see aggregates — counts and totals — rather than your individual records.
        </p>
        <p>
          <strong className="text-white">Service providers.</strong> We rely on a small number of
          processors:
        </p>
        <LegalTable
          head={["Provider", "What it does", "What it sees"]}
          rows={[
            ["Supabase", "Database, authentication, file storage and server functions", "Everything stored in your account"],
            ["Vercel", "Serves the website", "Standard request logs (IP address, browser)"],
            ["Yahoo Finance, MFAPI", "Live prices for holdings you track", "A security symbol only — never who asked"],
            ["Paddle", "Payments, once enabled", "Billing details you give at checkout. No payment processor is configured today; plan changes are made manually."],
            ["Resend", "Transactional email, once enabled", "Nothing today — email sending is not switched on. Invitations are shared as a link you send yourself."],
          ]}
        />
        <p>
          We will also disclose data where the law requires it. We do not sell personal data.
        </p>
      </Section>

      <Section id="retention" heading="How long we keep it">
        <p>
          Your records stay until you delete them or close your account. Everything else is on a
          timer that runs nightly:
        </p>
        <LegalTable
          head={["Data", "Kept for"]}
          rows={[
            ["Audit log entries", "400 days"],
            ["Notifications you have read", "90 days"],
            ["Notifications you never opened", "365 days"],
            ["Raw payment-provider payloads", "60 days (the subscription record itself is kept)"],
            ["A deleted workspace", "30 days, then permanently purged"],
            ["A pending invitation", "14 days, then it expires"],
          ]}
        />
      </Section>

      <Section id="security" heading="How it is protected">
        <p>
          Every finance table is scoped to a workspace and enforced in the database itself, so a
          request for someone else's data fails at the database, not merely in the interface.
          Uploaded documents are stored privately and served through short-lived links. Passwords
          are stored as hashes by our authentication provider; we never see them.
        </p>
        <p>
          No system is perfect. If you believe you have found a security problem, please write to{" "}
          <a className="text-[#19B886] hover:underline" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>{" "}
          before disclosing it publicly.
        </p>
      </Section>

      <Section id="rights" heading="Your rights">
        <p>
          You can see and correct your records at any time inside the product. From the Export page
          you can download <strong className="text-white">everything we hold about you</strong> in a
          workspace as a single JSON file — every table, every column, exactly as stored — as well as
          the CSV and PDF reports.
        </p>
        <p>
          To ask for a copy of everything we hold, or for your account and its data to be deleted,
          write to{" "}
          <a className="text-[#19B886] hover:underline" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.
          We will confirm your identity, act within 30 days, and tell you when it is done.
          Settings &rarr; Delete your account explains exactly what is removed and composes that
          request for you. The last steps are done by a person, which is why it is email rather than
          a button today.
        </p>
        <p>
          If you are the owner of a shared workspace, deleting your account also affects the people
          you invited — we will tell you what will happen before anything is removed.
        </p>
      </Section>

      <Section id="children" heading="Children">
        <p>
          FinRoot is not intended for children. Please do not create an account for anyone under 18.
        </p>
      </Section>

      <Section id="changes" heading="Changes to this policy">
        <p>
          When this policy changes materially we will update the version and effective date at the
          top and tell you in the product before the change takes effect. The{" "}
          <Link to="/terms" className="text-[#19B886] hover:underline">Terms of Service</Link> cover
          the rest of the relationship.
        </p>
      </Section>
    </LegalLayout>
  );
}
