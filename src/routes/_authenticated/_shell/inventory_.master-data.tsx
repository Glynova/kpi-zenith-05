import { createFileRoute, Link } from "@tanstack/react-router";

import {
  CategoriesPanel,
  LocationsPanel,
  SuppliersPanel,
  parseMasterDataTab,
  type MasterDataTab,
} from "@/components/master-data";
import { useBusiness } from "@/lib/business-context";
import { cn } from "@/lib/utils";

const description = "Categories, suppliers and locations used across your inventory.";

export const Route = createFileRoute("/_authenticated/_shell/inventory_/master-data")({
  validateSearch: (s: Record<string, unknown>): { tab: MasterDataTab } => ({
    tab: parseMasterDataTab(s.tab),
  }),
  head: () => ({
    meta: [
      { title: "Master Data — Daraven ERP" },
      { name: "description", content: description },
      { property: "og:title", content: "Master Data — Daraven ERP" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MasterDataPage,
});

function MasterDataPage() {
  const { tab } = Route.useSearch();
  const { feature } = useBusiness();
  const tabs: { id: MasterDataTab; label: string; enabled: boolean; hint?: string }[] = [
    { id: "categories", label: "Categories", enabled: true },
    {
      id: "suppliers",
      label: "Suppliers",
      enabled: feature("enable_purchasing"),
      hint: "Turn on Purchasing in Settings to manage suppliers.",
    },
    // The first/default location always exists; extra locations need Locations on
    // (enforced by the database), so the tab stays viewable.
    { id: "locations", label: "Locations", enabled: true },
  ];
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Master data"
        className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
      >
        {tabs.map((t) => (
          <Link
            key={t.id}
            to="/inventory/master-data"
            search={{ tab: t.id }}
            role="tab"
            aria-selected={t.id === current.id}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              t.id === current.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {!current.enabled ? (
        <p className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
          {current.hint}
        </p>
      ) : current.id === "categories" ? (
        <CategoriesPanel />
      ) : current.id === "suppliers" ? (
        <SuppliersPanel />
      ) : (
        <LocationsPanel />
      )}
    </div>
  );
}
