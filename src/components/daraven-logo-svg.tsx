import { cn } from "@/lib/utils";
import { blueLogo, goldLogo } from "@/components/daraven-logo-paths";

/** Official artwork, traced into SVG paths without substituting its wordmark. */
export function DaravenLogoSvg({
  className,
  compact = false,
  variant = "gold",
}: {
  className?: string;
  compact?: boolean;
  variant?: "blue" | "gold";
}) {
  const artwork = variant === "blue" ? blueLogo : goldLogo;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${compact ? artwork.markWidth : artwork.width} ${artwork.height}`}
      role="img"
      aria-label="Daraven ERP"
      data-logo-variant={variant}
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-9 w-auto shrink-0", className)}
    >
      {artwork.paths.map((path, index) => <path key={index} {...path} />)}
    </svg>
  );
}
