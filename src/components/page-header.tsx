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
    <header className="min-w-0 space-y-5">
      <div className="min-w-0">
        <h1 className="break-words font-display text-[32px] font-semibold leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[720px] text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
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
    <div className="surface-card flex flex-col items-center justify-center px-6 py-14 text-center">
      <EmptyIllustration kind={illustration} />
      <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
