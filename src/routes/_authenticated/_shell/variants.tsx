import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route. Variants are managed inside the product form, which is the
 * single source of truth for a product and all of its sellable variants.
 */
export const Route = createFileRoute("/_authenticated/_shell/variants")({
  beforeLoad: () => {
    throw redirect({ to: "/products" });
  },
  component: () => null,
});
