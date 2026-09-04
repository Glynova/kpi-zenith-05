import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";

import { recordReferralClick } from "@/lib/affiliate.functions";
import { storeReferralCode } from "@/lib/referral-storage";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/r/$code")({
  head: () => ({
    meta: [
      { title: "You've been invited to Daraven ERP" },
      {
        name: "description",
        content:
          "Start your 14-day Daraven ERP Pro trial through a partner invitation — inventory, sales, finance and payroll in one workspace.",
      },
      { property: "og:title", content: "You've been invited to Daraven ERP" },
      {
        property: "og:description",
        content: "Claim your partner invitation and start a 14-day Pro trial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferralLanding,
});

function ReferralLanding() {
  const { code } = useParams({ from: "/r/$code" });
  const navigate = useNavigate();
  const track = useServerFn(recordReferralClick);
  const [partner, setPartner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    storeReferralCode(code);
    void track({
      data: {
        code,
        landingPath: window.location.pathname,
        referrer: document.referrer || undefined,
      },
    })
      .then((res) => {
        if (!cancelled && res.valid) setPartner(res.partnerName);
      })
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => {
          if (!cancelled) void navigate({ to: "/auth", replace: true });
        }, 1200);
      });
    return () => {
      cancelled = true;
    };
  }, [code, navigate, track]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLogo />
      <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
        <Sparkles className="size-4" />
        {partner ? `Invited by ${partner}` : "Checking your invitation…"}
      </div>
      <h1 className="max-w-md font-display text-2xl font-semibold">
        Setting up your Daraven ERP invitation
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        We&apos;re taking you to sign up. Your invitation code <strong>{code}</strong> stays
        attached to the workspace you create.
      </p>
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </main>
  );
}
