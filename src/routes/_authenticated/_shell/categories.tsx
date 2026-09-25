import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved to Inventory > Master Data. Kept so old links keep working.
export const Route = createFileRoute("/_authenticated/_shell/categories")({
  beforeLoad: () => {
    throw redirect({ to: "/inventory/master-data", search: { tab: "categories" } });
  },
});
