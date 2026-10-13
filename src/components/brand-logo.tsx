import { cn } from "@/lib/utils";
import markAsset from "@/assets/daraven-mark.png.asset.json";
import logoAsset from "@/assets/daraven-logo.png.asset.json";
import { DaravenLogoSvg } from "@/components/daraven-logo-svg";

/** Daraven raven mark — SVG in light mode, original blue artwork in dark mode. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <>
      <DaravenLogoSvg compact className={cn("size-8 w-auto dark:hidden", className)} />
      <img
        src={markAsset.url}
        alt=""
        aria-hidden
        className={cn("hidden size-8 w-auto object-contain dark:block", className)}
        loading="eager"
        decoding="async"
      />
    </>
  );
}

/** Shared header identity; artwork remains theme-specific, lettering stays consistent. */
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
      className={cn("inline-flex min-w-0 items-center gap-2.5", inverse && "brand-identity-inverse")}
    >
      <span className="flex h-8 w-10 shrink-0 items-center justify-center">
        {inverse ? (
          <img src={markAsset.url} alt="" className="h-8 w-auto max-w-full object-contain" />
        ) : (
          <BrandMark className="h-8 w-auto max-w-full" />
        )}
      </span>
      {!compact && (
        <span className="min-w-0 leading-none" aria-hidden="true">
          <span className="brand-name block truncate">DARAVEN</span>
          <span className="brand-edition mt-1 block">ERP</span>
        </span>
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
      <img
        src={logoAsset.url}
        alt="Daraven ERP — Smarter Decisions. Better Performance."
        className={cn("hidden h-9 w-auto object-contain dark:block", className)}
        loading="eager"
        decoding="async"
      />
    </>
  );
}
