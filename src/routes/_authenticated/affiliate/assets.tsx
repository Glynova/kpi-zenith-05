/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { BrandMark } from "@/components/brand-logo";
import { referralUrl } from "@/lib/affiliate";
import { usePartnerDashboard } from "@/lib/use-affiliate";

export const Route = createFileRoute("/_authenticated/affiliate/assets")({
  head: () => ({
    meta: [
      { title: "Marketing Assets — Daraven ERP" },
      { name: "description", content: "Brand assets and copy for promoting Daraven." },
      { property: "og:title", content: "Marketing Assets — Daraven ERP" },
      { property: "og:description", content: "Brand assets and copy for promoting Daraven." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  const { data, isLoading } = usePartnerDashboard();
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = referralUrl(origin, (data.partner as any).referral_code);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const templates = [
    {
      title: "Short social post",
      body: `Running a retail or wholesale business on spreadsheets? Daraven ERP puts inventory, POS, purchasing, finance and payroll in one workspace. Start a 14-day Pro trial: ${link}`,
    },
    {
      title: "Email intro",
      body: `Hi {{name}},\n\nYou mentioned stock and invoicing are getting hard to track. Daraven ERP handles inventory (with FIFO/average costing), POS, purchase orders, receivables and payroll in a single system — and it's ₱999/month for the Pro plan.\n\nThere's a 14-day free trial here: ${link}\n\nHappy to walk you through setup.`,
    },
    {
      title: "One-liner",
      body: `Daraven ERP — Smarter Decisions. Better Performance. ${link}`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing assets"
        description="Approved copy and brand marks. Every link already includes your referral code."
      />

      <Card className="shadow-elevate-1">
        <CardHeader>
          <CardTitle className="text-base">Brand mark</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-8">
          <div className="rounded-xl border border-border bg-background p-6 text-foreground">
            <BrandMark className="h-12 w-auto" />
          </div>
          <div className="rounded-xl border border-border bg-foreground p-6 text-background">
            <BrandMark className="h-12 w-auto" />
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">
            Use the mark on light or dark backgrounds with clear space equal to its height. Don&apos;t
            recolour, stretch, or add effects.
          </p>
        </CardContent>
      </Card>

      {templates.map((t) => (
        <Card key={t.title} className="shadow-elevate-1">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t.title}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => copy(t.body)}>
              <Copy className="size-4" /> Copy
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea readOnly value={t.body} rows={t.body.split("\n").length + 2} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
