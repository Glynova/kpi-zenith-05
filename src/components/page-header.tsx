import type { ReactNode } from "react";

import { EmptyIllustration, type IllustrationKind } from "@/components/empty-illustration";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <h1 className="break-words font-display text-2xl font-semibold sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
       {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
  illustration = "generic",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: IllustrationKind;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <EmptyIllustration kind={illustration} />
      <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
