import { cn } from "@/lib/utils";
import markAsset from "@/assets/daraven-mark.png.asset.json";
import logoAsset from "@/assets/daraven-logo.png.asset.json";
import markLightAsset from "@/assets/daraven-mark-light.png.asset.json";
import logoLightAsset from "@/assets/daraven-logo-light.png.asset.json";

/** Daraven raven mark — original artwork, light/dark variants. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <>
      <img
        src={markLightAsset.url}
        alt="Daraven ERP"
        className={cn("size-8 w-auto object-contain dark:hidden", className)}
        loading="eager"
        decoding="async"
      />
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
      <img
        src={logoLightAsset.url}
        alt="Daraven ERP — Smarter Decisions. Better Performance."
        className={cn("h-9 w-auto object-contain dark:hidden", className)}
        loading="eager"
        decoding="async"
      />
      <img
        src={logoAsset.url}
        alt=""
        aria-hidden
        className={cn("hidden h-9 w-auto object-contain dark:block", className)}
        loading="eager"
        decoding="async"
      />
    </>
  );
}
