import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage, Placeholder, type LegalSection } from "@/components/legal-page";

export const TERMS_VERSION = "1.0";
export const TERMS_EFFECTIVE = "October 18, 2026";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Daraven ERP" },
      {
        name: "description",
        content:
          "The terms that govern your use of Daraven ERP: accounts, subscriptions and billing, acceptable use, your business data, and service availability.",
      },
      { property: "og:title", content: "Terms of Service — Daraven ERP" },
      {
        property: "og:description",
        content:
          "The terms that govern your use of Daraven ERP: accounts, subscriptions and billing, acceptable use, your business data, and service availability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://daraven.com/terms" },
    ],
    links: [{ rel: "canonical", href: "https://daraven.com/terms" }],
  }),
  component: TermsPage,
});

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement and who we are",
    body: (
      <>
        <p>
          These Terms of Service ("Terms") govern your access to and use of Daraven ERP
          ("Daraven", "the Service"), a cloud-based business management platform offering
          inventory, sales, purchasing, finance, payroll and KPI analytics, operated from the
          Philippines.
        </p>
        <p>
          The Service is provided by <Placeholder>registered legal entity name</Placeholder>
          ("we", "us", "our"), with principal address at{" "}
          <Placeholder>registered business address</Placeholder>. You can contact us at{" "}
          <Placeholder>legal/contact email address</Placeholder>.
        </p>
        <p>
          By creating an account, clicking to accept these Terms, or using the Service, you agree
          to be bound by these Terms and our{" "}
          <Link to="/privacy" className="text-gold underline-offset-4 hover:underline">
            Data Privacy Policy
          </Link>
          . If you use the Service on behalf of a business, you represent that you are authorized
          to bind that business, and "you" refers to that business.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Account eligibility",
    body: (
      <>
        <p>
          You must be at least 18 years old and capable of entering into a binding contract to
          use the Service. The Service is intended for business use and is not directed at
          children.
        </p>
        <p>
          You must provide accurate and complete registration information, keep your credentials
          confidential, and promptly notify us of any unauthorized use of your account. You are
          responsible for all activity that occurs under your account, including activity by
          team members you invite.
        </p>
      </>
    ),
  },
  {
    id: "subscriptions",
    title: "Subscriptions, billing and cancellation",
    body: (
      <>
        <p>
          The Service is offered under free and paid subscription plans described on our{" "}
          <Link to="/pricing" className="text-gold underline-offset-4 hover:underline">
            pricing page
          </Link>
          . Paid plans are billed in Philippine pesos (PHP) on a monthly basis through our
          third-party payment processor. New workspaces may include a free trial; at the end of
          the trial, continued access to paid features requires an active paid subscription.
        </p>
        <p>
          Subscription fees are non-refundable except where required by applicable law,
          including the Consumer Act of the Philippines (RA 7394) and the E-Commerce Act
          (RA 8792), or where we expressly state otherwise. You may cancel your subscription at
          any time from your billing settings; cancellation takes effect at the end of the
          current billing period and no further fees will be charged.
        </p>
        <p>
          We may change plan prices with at least thirty (30) days' advance notice. Price
          changes apply from your next billing period after the notice period. If you do not
          agree to a price change, you may cancel before it takes effect.
        </p>
        <p>
          If payment fails, we may retry collection and, after reasonable notice, suspend paid
          features until payment is resolved. Your data is not deleted solely because a payment
          fails; see the termination section for data handling after account closure.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use the Service for any unlawful purpose, or to violate any law or regulation.</li>
          <li>
            Upload or process data you have no right to use, or that infringes the rights of
            others.
          </li>
          <li>
            Attempt to gain unauthorized access to the Service, other accounts, or related
            systems, or to probe, scan or test vulnerabilities without permission.
          </li>
          <li>
            Interfere with or disrupt the Service, including by introducing malware or
            overloading infrastructure.
          </li>
          <li>
            Reverse engineer, resell, sublicense or commercially exploit the Service except as
            permitted by these Terms.
          </li>
          <li>
            Use the Service to store or process data relating to children, or special categories
            of personal data, except where you have a lawful basis to do so.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "your-data",
    title: "Your business data",
    body: (
      <>
        <p>
          You retain all rights to the business data you and your team enter into the Service
          ("Customer Data"), including products, inventory, sales, customer, supplier and
          employee records. We claim no ownership over Customer Data.
        </p>
        <p>
          You grant us a limited, non-exclusive license to host, process, transmit and display
          Customer Data solely as needed to provide and improve the Service, in accordance with
          our Data Privacy Policy.
        </p>
        <p>
          <strong className="text-white/85">Your role as data controller.</strong> For personal
          data of your own customers, employees and suppliers that you store in the Service, you
          are the personal information controller under the Philippine Data Privacy Act of 2012
          (RA 10173), and we act as your personal information processor. You are responsible for
          having a lawful basis to collect and process that data, for informing your data
          subjects, and for responding to their requests. We process such data only on your
          documented instructions through your use of the Service.
        </p>
        <p>
          You are responsible for the accuracy and legality of Customer Data and for maintaining
          your own backups where your business requires them. Reports and records can be
          exported from the Service in CSV format.
        </p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    body: (
      <>
        <p>
          The Service, including its software, design, branding, logos and documentation, is
          owned by us or our licensors and is protected by intellectual property laws, including
          the Intellectual Property Code of the Philippines (RA 8293). These Terms grant you a
          limited, non-exclusive, non-transferable, revocable right to access and use the
          Service for your internal business purposes during your subscription.
        </p>
        <p>
          If you provide feedback or suggestions, you grant us a perpetual, royalty-free right
          to use them to improve the Service, without obligation to you.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Service availability and support",
    body: (
      <>
        <p>
          We aim to keep the Service available and reliable, but the Service is provided on an
          "as available" basis. We do not guarantee uninterrupted or error-free operation, and
          we may perform scheduled or emergency maintenance, modify features, or discontinue
          features with reasonable notice where practicable.
        </p>
        <p>
          The Service depends on third-party infrastructure (cloud hosting, authentication,
          email delivery and payment processing). We are not responsible for outages caused by
          those providers, though we will work to restore service promptly.
        </p>
        <p>
          The Service provides business tools and reports; it does not constitute accounting,
          tax, legal or professional advice. You remain responsible for your own regulatory
          filings, tax compliance and record-keeping obligations.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Disclaimers and limitation of liability",
    body: (
      <>
        <p>
          To the maximum extent permitted by law, the Service is provided "as is" and we
          disclaim all implied warranties, including merchantability, fitness for a particular
          purpose and non-infringement.
        </p>
        <p>
          To the maximum extent permitted by law, our aggregate liability arising out of or
          relating to the Service is limited to the amounts you paid us for the Service in the
          twelve (12) months preceding the event giving rise to the claim. We are not liable for
          indirect, incidental, special, consequential or punitive damages, or for lost profits,
          lost revenue, lost data or business interruption.
        </p>
        <p>
          Nothing in these Terms excludes or limits liability that cannot be excluded or limited
          under applicable law, including liability for fraud, gross negligence, willful
          misconduct, or death or personal injury caused by our negligence, and nothing limits
          any rights you may have under the Consumer Act of the Philippines or other
          non-waivable statutory protections.
        </p>
      </>
    ),
  },
  {
    id: "suspension-termination",
    title: "Suspension and termination",
    body: (
      <>
        <p>
          We may suspend or terminate your access to the Service if you materially breach these
          Terms, if required by law, or if your use poses a security or legal risk. Where
          practicable, we will give you notice and an opportunity to cure the breach before
          suspension.
        </p>
        <p>
          You may close your account at any time. Upon termination, your right to use the
          Service ends. We will retain Customer Data for a limited period after termination as
          described in our Data Privacy Policy, after which it will be deleted or anonymized,
          unless longer retention is required by law. You should export any data you need before
          closing your account.
        </p>
      </>
    ),
  },
  {
    id: "updates",
    title: "Changes to these Terms",
    body: (
      <>
        <p>
          We may update these Terms from time to time. If we make material changes, we will
          notify you through the Service or by email at least fourteen (14) days before the
          changes take effect, and we will update the version number and effective date above.
          Your continued use of the Service after the effective date constitutes acceptance of
          the updated Terms. If you do not agree, you may cancel your subscription and close
          your account before the changes take effect.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law and disputes",
    body: (
      <>
        <p>
          These Terms are governed by the laws of the Republic of the Philippines, without
          regard to conflict-of-laws rules.
        </p>
        <p>
          We encourage you to contact us first at{" "}
          <Placeholder>legal/contact email address</Placeholder> to resolve any dispute
          informally. If a dispute cannot be resolved informally, it shall be brought before the
          competent courts of <Placeholder>city/province of venue</Placeholder>, Philippines, to
          the extent permitted by applicable law. Nothing in this section limits any mandatory
          consumer protection rights or venues available to you under Philippine law.
        </p>
      </>
    ),
  },
  {
    id: "miscellaneous",
    title: "Miscellaneous",
    body: (
      <>
        <p>
          These Terms, together with the Data Privacy Policy and any plan-specific terms, are
          the entire agreement between you and us regarding the Service. If any provision is
          found unenforceable, the remaining provisions remain in effect. Our failure to enforce
          a provision is not a waiver. You may not assign these Terms without our consent; we
          may assign them in connection with a merger, acquisition or sale of assets, with
          notice to you.
        </p>
      </>
    ),
  },
];

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      version={TERMS_VERSION}
      effectiveDate={TERMS_EFFECTIVE}
      intro={
        <p>
          These Terms govern your use of Daraven ERP. Please read them carefully. Sections
          marked with a highlighted note contain details the service owner must complete before
          these Terms are finalized.
        </p>
      }
      sections={sections}
    />
  );
}
