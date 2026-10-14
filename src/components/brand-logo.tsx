import { cn } from "@/lib/utils";
import { DaravenLogoSvg } from "@/components/daraven-logo-svg";

/** Official gold artwork on light surfaces; official blue artwork on dark surfaces. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <>
      <DaravenLogoSvg compact className={cn("size-8 w-auto dark:hidden", className)} />
      <DaravenLogoSvg
        compact
        variant="blue"
        className={cn("hidden size-8 w-auto dark:block", className)}
      />
    </>
  );
}

/** Shared official wordmark; inverse denotes an always-dark public surface. */
export function BrandIdentity({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <span
      aria-label="Daraven ERP"
      data-brand-identity
      className="inline-flex min-w-0 max-w-full items-center"
    >
      {inverse ? (
        <DaravenLogoSvg variant="blue" compact={compact} className="brand-artwork" />
      ) : (
        <BrandLogo compact={compact} className="brand-artwork" />
      )}
    </span>
  );
}

export function BrandLogo({
  className,
  markClassName,
  compact = false,
}: {
  className?: string;
  markClassName?: string;
  compact?: boolean;
}) {
  if (compact) {
    return <BrandMark className={cn(markClassName, className)} />;
  }

  return (
    <>
      <DaravenLogoSvg className={cn("h-9 w-auto dark:hidden", className)} />
      <DaravenLogoSvg variant="blue" className={cn("hidden h-9 w-auto dark:block", className)} />
    </>
  );
}
