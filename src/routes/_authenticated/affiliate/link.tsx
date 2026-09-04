/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Link2, QrCode } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { referralUrl } from "@/lib/affiliate";
import { usePartnerDashboard } from "@/lib/use-affiliate";

export const Route = createFileRoute("/_authenticated/affiliate/link")({
  component: ReferralLinkPage,
});

function ReferralLinkPage() {
  const { data, isLoading } = usePartnerDashboard();
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const code = (data.partner as any).referral_code as string;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = referralUrl(origin, code);
  const full = campaign.trim()
    ? `${base}?utm_source=affiliate&utm_campaign=${encodeURIComponent(campaign.trim())}`
    : base;

  function copy(value: string, key: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your referral link"
        description="Attribution is stored against the workspace at signup, so it survives cleared cookies."
      />

      <Card className="shadow-elevate-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-4 text-primary" /> Share link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Referral code</Label>
            <div className="flex gap-2">
              <Input readOnly value={code} className="font-mono" />
              <Button variant="outline" onClick={() => copy(code, "code")}>
                {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="campaign">Campaign tag (optional)</Label>
            <Input
              id="campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="newsletter-march"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Link</Label>
            <div className="flex gap-2">
              <Input readOnly value={full} className="font-mono text-xs" />
              <Button onClick={() => copy(full, "link")}>
                {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
                Copy
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-elevate-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="size-4 text-primary" /> QR code
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(full)}`}
            alt={`QR code for referral link ${code}`}
            width={220}
            height={220}
            loading="lazy"
            className="rounded-lg border border-border bg-white p-2"
          />
          <p className="text-xs text-muted-foreground">Right-click to save for print materials.</p>
        </CardContent>
      </Card>
    </div>
  );
}
