import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage, Placeholder, type LegalSection } from "@/components/legal-page";

export const PRIVACY_VERSION = "1.0";
export const PRIVACY_EFFECTIVE = "October 18, 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Data Privacy Policy — Daraven ERP" },
      {
        name: "description",
        content:
          "How Daraven ERP collects, uses, protects and retains personal data, in line with the Philippine Data Privacy Act of 2012 (RA 10173).",
      },
      { property: "og:title", content: "Data Privacy Policy — Daraven ERP" },
      {
        property: "og:description",
        content:
          "How Daraven ERP collects, uses, protects and retains personal data, in line with the Philippine Data Privacy Act of 2012 (RA 10173).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://daraven.com/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://daraven.com/privacy" }],
  }),
  component: PrivacyPage,
});

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are (controller identity and contact)",
    body: (
      <>
        <p>
          This Data Privacy Policy explains how Daraven ERP ("Daraven", "we", "us") collects,
          uses, shares, protects and retains personal data when you use our cloud-based business
          management platform and website (the "Service").
        </p>
        <p>
          For your account data and for the operation of the Service, the personal information
          controller is <Placeholder>registered legal entity name</Placeholder>, with principal
          address at <Placeholder>registered business address</Placeholder>. You may reach our
          data protection contact at <Placeholder>privacy/DPO email address</Placeholder>.{" "}
          <Placeholder>Data Protection Officer name and contact, if designated</Placeholder>
        </p>
        <p>
          We handle personal data in accordance with the Philippine Data Privacy Act of 2012
          (RA 10173), its Implementing Rules and Regulations, and applicable issuances of the
          National Privacy Commission (NPC).
        </p>
      </>
    ),
  },
  {
    id: "roles",
    title: "Our role vs. your business's role",
    body: (
      <>
        <p>
          Daraven is a software-as-a-service provider. It is important to distinguish two roles:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white/85">Your account data.</strong> For information about
            you as a Daraven account holder (name, email, login, billing), Daraven is the
            personal information controller.
          </li>
          <li>
            <strong className="text-white/85">Your business data.</strong> For personal data
            that your business enters into the Service about your own customers, employees and
            suppliers (for example payroll records or customer contacts), your business is the
            personal information controller and Daraven acts as your personal information
            processor, processing that data only on your instructions through your use of the
            Service. Your business is responsible for its own privacy notices, lawful bases and
            responses to its data subjects.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "Data we collect",
    body: (
      <>
        <p>We collect and process the following categories of personal data:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white/85">Account data:</strong> name, email address,
            password (stored only as a cryptographic hash by our authentication provider), and
            profile details you provide.
          </li>
          <li>
            <strong className="text-white/85">Billing data:</strong> plan selection, payment
            status and transaction references. Full payment instrument details are collected and
            processed by our payment processor; we do not store full card or account numbers.
          </li>
          <li>
            <strong className="text-white/85">Business data you enter:</strong> products,
            inventory, sales, purchasing, finance, and — where you use those modules — records
            about your customers, suppliers and employees (which may include names, contact
            details, attendance and payroll information).
          </li>
          <li>
            <strong className="text-white/85">Usage and technical data:</strong> log data such
            as IP address, browser type, device information, pages visited and actions taken,
            used for security, debugging and service improvement.
          </li>
          <li>
            <strong className="text-white/85">Communications:</strong> messages you send us for
            support or inquiries.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "purposes",
    title: "Purposes and legal bases",
    body: (
      <>
      <p>We process personal data for the following purposes and on the following bases:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white/85">Providing the Service</strong> — creating and
            managing your account, operating the modules you use, and delivering customer
            support (performance of our contract with you).
          </li>
          <li>
            <strong className="text-white/85">Billing and administration</strong> — processing
            subscription payments, invoicing and account management (contract performance and
            legitimate interest).
          </li>
          <li>
            <strong className="text-white/85">Security and fraud prevention</strong> —
            protecting accounts, detecting abuse and keeping audit logs (legitimate interest and
            legal obligation).
          </li>
          <li>
            <strong className="text-white/85">Service improvement</strong> — understanding how
            the Service is used to improve features and reliability (legitimate interest, using
            aggregated or de-identified data where practicable).
          </li>
          <li>
            <strong className="text-white/85">Legal compliance</strong> — meeting tax,
            accounting and regulatory obligations (legal obligation).
          </li>
          <li>
            <strong className="text-white/85">Communications</strong> — sending service
            announcements and, where you have consented, product updates or marketing, which you
            may opt out of at any time (consent or legitimate interest, as applicable).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "processors",
    title: "Service providers and subprocessors",
    body: (
      <>
        <p>
          We use trusted third-party providers to operate the Service, which process personal
          data on our behalf under appropriate safeguards:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white/85">Cloud hosting and database:</strong> managed cloud
            infrastructure that hosts the application and stores data.
          </li>
          <li>
            <strong className="text-white/85">Authentication:</strong> a managed authentication
            service that secures sign-in, including optional Google sign-in.
          </li>
          <li>
            <strong className="text-white/85">Email delivery:</strong> a transactional email
            provider for account confirmations, invitations and notifications.
          </li>
          <li>
            <strong className="text-white/85">Payment processing:</strong> PayMongo, which
            processes subscription payments (including QR Ph) under its own privacy policy; we
            receive only payment status and references.
          </li>
        </ul>
        <p>
          We do not sell your personal data. We disclose personal data to third parties only as
          described in this Policy, with your consent, or where required by law, lawful order or
          to protect rights and safety.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Data retention",
    body: (
      <>
        <p>
          We retain your account data for as long as your account is active. Business data is
          retained while your workspace is active and for a limited period after closure to
          allow reactivation or export, after which it is deleted or anonymized.
        </p>
        <p>
          Certain records (for example billing and transaction records, and security audit logs)
          may be retained longer where required by Philippine tax, accounting or other laws, or
          to establish, exercise or defend legal claims. When retention is no longer necessary,
          data is securely deleted or anonymized.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "How we protect your data",
    body: (
      <>
        <p>
          We apply organizational, physical and technical measures appropriate to the risks,
          including encryption of data in transit, row-level tenant isolation so each business
          can only access its own data, role-based access controls enforced at the database
          level, and audit logging of sensitive actions.
        </p>
        <p>
          No method of transmission or storage is completely secure, and we cannot guarantee
          absolute security. You also play a role: keep your password confidential, use strong
          passwords, and manage your team members' access roles carefully.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your rights and how to exercise them",
    body: (
      <>
        <p>
          Under the Data Privacy Act, you have the right to be informed; to object; to access;
          to correct; to rectification, erasure or blocking; to damages; and to data
          portability, subject to the conditions and exceptions in the law.
        </p>
        <p>
          To exercise any of these rights, contact us at{" "}
          <Placeholder>privacy/DPO email address</Placeholder>. We may need to verify your
          identity before acting on a request, and we will respond within a reasonable period
          consistent with NPC requirements. If your request concerns business data controlled by
          a business you transact with (for example your employer's payroll records), please
          direct it to that business as the controller; we will assist the business as its
          processor.
        </p>
      </>
    ),
  },
  {
    id: "complaints",
    title: "Complaints",
    body: (
      <>
        <p>
          If you have concerns about how we handle your personal data, please contact us first
          at <Placeholder>privacy/DPO email address</Placeholder> so we can address them.
        </p>
        <p>
          You also have the right to lodge a complaint with the National Privacy Commission
          (NPC) of the Philippines through its official channels at privacy.gov.ph.
        </p>
      </>
    ),
  },
  {
    id: "breaches",
    title: "Personal data breach handling",
    body: (
      <>
        <p>
          If a personal data breach occurs that is likely to give rise to a real risk of serious
          harm, we will notify the National Privacy Commission and affected data subjects within
          the period required by NPC rules, and we will take steps to contain and remediate the
          breach. Where a breach affects business data you control, we will notify you without
          undue delay so you can meet your own notification obligations.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International data transfers",
    body: (
      <>
        <p>
          Some of our service providers store or process data on servers located outside the
          Philippines. Where personal data is transferred internationally, we rely on
          contractual protections and the providers' safeguards to ensure the data remains
          protected consistent with the Data Privacy Act. By using the Service, you acknowledge
          these transfers.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and analytics",
    body: (
      <>
        <p>
          The Service uses cookies and similar technologies that are necessary for
          authentication and security (for example, keeping you signed in). We may use
          privacy-respecting, aggregated usage analytics to improve the Service; these are not
          used to build advertising profiles, and we do not serve third-party advertising.
        </p>
        <p>
          You can control cookies through your browser settings, but disabling necessary cookies
          may prevent sign-in and core features from working.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children's data",
    body: (
      <>
        <p>
          The Service is intended for business use by adults and is not directed at persons
          under 18. We do not knowingly collect personal data from children. If you believe a
          child has provided us personal data, contact us and we will delete it. Businesses
          using the Service must not store children's personal data in it unless they have a
          lawful basis to do so.
        </p>
      </>
    ),
  },
  {
    id: "updates",
    title: "Changes to this Policy",
    body: (
      <>
        <p>
          We may update this Policy from time to time. For material changes, we will notify you
          through the Service or by email before the changes take effect, and we will update the
          version number and effective date above. Your continued use of the Service after the
          effective date constitutes acceptance of the updated Policy.
        </p>
        <p>
          See also our{" "}
          <Link to="/terms" className="text-gold underline-offset-4 hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </>
    ),
  },
];

function PrivacyPage() {
  return (
    <LegalPage
      title="Data Privacy Policy"
      version={PRIVACY_VERSION}
      effectiveDate={PRIVACY_EFFECTIVE}
      intro={
        <p>
          This Policy describes how Daraven ERP handles personal data in line with the
          Philippine Data Privacy Act of 2012 (RA 10173). Sections marked with a highlighted
          note contain details the service owner must complete before this Policy is finalized.
        </p>
      }
      sections={sections}
    />
  );
}
