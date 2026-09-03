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
