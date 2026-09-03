import { cn } from "@/lib/utils";
import markAsset from "@/assets/daraven-mark.png.asset.json";
import logoAsset from "@/assets/daraven-logo.png.asset.json";

/** Daraven raven mark — the original brand artwork, unmodified. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={markAsset.url}
      alt="Daraven ERP"
      className={cn("size-8 w-auto object-contain", className)}
      loading="eager"
      decoding="async"
    />
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
    <img
      src={logoAsset.url}
      alt="Daraven ERP — Smarter Decisions. Better Performance."
      className={cn("h-9 w-auto object-contain", className)}
      loading="eager"
      decoding="async"
    />
  );
}
