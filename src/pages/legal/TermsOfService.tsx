import { Link } from "react-router-dom";

import { PRIVACY_CONTACT } from "@/lib/legal";
import LegalLayout, { Section } from "./LegalLayout";

/**
 * Stage 5.1 — the terms of service.
 *
 * Written against what the product actually does today: manual plan changes
 * (no payment gateway is configured), shared workspaces, device-local PINs,
 * and market data that is informational rather than advice. Keep the promises
 * in here true — a term the product does not honour is worse than no term.
 *
 * ⚠️ NOT reviewed by a lawyer. That review is a launch blocker.
 */
export default function TermsOfService() {
  return (
    <LegalLayout
      title="Terms of Service"
      summary="The agreement between you and FinRoot: what you can expect from the product, and what we expect from you."
    >
      <Section id="agreement" heading="1. The agreement">
        <p>
          By creating an account you agree to these terms and to the{" "}
          <Link to="/privacy" className="text-[#19B886] hover:underline">Privacy Policy</Link>. If you
          do not agree, please do not use FinRoot.
        </p>
        <p>
          You must be 18 or older, and the details you give us at sign-up must be accurate.
        </p>
      </Section>

      <Section id="account" heading="2. Your account">
        <p>
          You are responsible for what happens under your account, including keeping your password
          private. Tell us promptly if you think someone else has access to it.
        </p>
        <p>
          The screen-lock PIN is a convenience on a single device — it is hashed and stored in that
          browser, and we cannot recover it. Losing it does not lose your data: sign in again with
          your password.
        </p>
      </Section>

      <Section id="workspaces" heading="3. Shared workspaces">
        <p>
          A workspace can be shared with people you invite. Anyone you invite can see the records in
          that workspace at the role you give them, and an owner or admin can change or remove
          records. Invite deliberately — it is the same as handing someone your books.
        </p>
        <p>
          Invitation links are valid for 14 days and work only for the email address they were
          issued to.
        </p>
      </Section>

      <Section id="your-data" heading="4. Your data stays yours">
        <p>
          You keep every right in the records you put into FinRoot. You grant us only the permission
          needed to operate the service for you — to store, process and display your data back to
          you and to anyone you have invited.
        </p>
        <p>
          You can export your records at any time, and you can ask us to delete your account. See the{" "}
          <Link to="/privacy" className="text-[#19B886] hover:underline">Privacy Policy</Link> for how.
        </p>
      </Section>

      <Section id="acceptable-use" heading="5. Acceptable use">
        <p>Please do not:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>use FinRoot for anything unlawful, or to store data you have no right to hold;</li>
          <li>try to access another user's workspace, or probe, scan or attack the service;</li>
          <li>resell the service, or scrape it to build a competing product;</li>
          <li>upload malware, or automate the product in a way that degrades it for others.</li>
        </ul>
        <p>
          We may suspend an account that does any of these, and will tell you why unless the law
          prevents us.
        </p>
      </Section>

      <Section id="plans" heading="6. Plans and payment">
        <p>
          FinRoot has a free plan and paid plans. Which features a workspace can reach is decided by
          its plan and is enforced on our servers.
        </p>
        <p>
          <strong className="text-white">There is no self-serve checkout today.</strong> Plan changes
          are arranged with us directly and applied by hand; if that changes, this section and the
          Billing page will change with it. Where a paid plan is billed by a payment provider, their
          terms cover the payment itself, and prices are shown inclusive of applicable taxes.
        </p>
      </Section>

      <Section id="not-advice" heading="7. FinRoot is not financial advice">
        <p>
          FinRoot records and organises what you tell it. It is a bookkeeping tool, not an adviser.
          Nothing in the product — including budgets, projections, allocations and the 7-bucket
          model — is investment, tax or legal advice, and none of it is personalised to your
          circumstances.
        </p>
        <p>
          Market prices and fund values come from third-party sources, may be delayed or wrong, and
          are shown for information only. Check anything that matters against your broker,
          registrar or bank statement before acting on it. Decisions you make with your money are
          yours.
        </p>
      </Section>

      <Section id="availability" heading="8. Availability">
        <p>
          We work to keep FinRoot available, but we do not promise uninterrupted service. We may
          take it down for maintenance, and we may change or remove features. If a change removes
          something you rely on, we will give you reasonable notice and an export path.
        </p>
        <p>
          The service is provided "as is". To the extent the law allows, we exclude implied
          warranties, and our liability is limited to the amount you paid us in the twelve months
          before the claim. Nothing here limits liability that cannot be limited by law.
        </p>
      </Section>

      <Section id="ending" heading="9. Ending the agreement">
        <p>
          You may stop using FinRoot at any time and ask us to delete your account. We may end or
          suspend an account for a serious or repeated breach of these terms, or if we stop offering
          the service — in which case we will give notice and time to export.
        </p>
        <p>
          A deleted workspace is recoverable for 30 days and permanently purged after that.
        </p>
      </Section>

      <Section id="changes" heading="10. Changes to these terms">
        <p>
          When these terms change materially we will update the version and effective date at the
          top and tell you in the product before the change takes effect. Continuing to use FinRoot
          after that means you accept the new terms.
        </p>
      </Section>

      <Section id="law" heading="11. Governing law and contact">
        <p>
          These terms are governed by the laws of India, and the courts of India have exclusive
          jurisdiction. The seat of jurisdiction must be confirmed before launch.
        </p>
        <p>
          Questions about these terms:{" "}
          <a className="text-[#19B886] hover:underline" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
