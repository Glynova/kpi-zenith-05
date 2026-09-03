import { cn } from "@/lib/utils";

/**
 * Daraven raven mark.
 * The body uses `currentColor` so it inherits the surrounding text color and
 * flips automatically between light and dark mode; the wing blades keep the
 * brand blue gradient, which reads well on both backgrounds.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      role="img"
      aria-label="Daraven"
      className={cn("size-8 text-foreground", className)}
    >
      <defs>
        <linearGradient id="daraven-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="55%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>

      {/* swept wing blades */}
      <g fill="url(#daraven-wing)">
        <path d="M3 3C17 7 28 14 35 22l-8 2C21 16 12 9 3 3Z" />
        <path d="M1 14c15 2 25 7 32 14l-8 2C19 23 10 17 1 14Z" />
        <path d="M4 25c13 0 21 3 27 8l-8 2c-6-5-12-8-19-10Z" />
      </g>

      {/* body, head and beak */}
      <path
        fill="currentColor"
        d="M5 45c15-4 28-13 38-26 3-4 8-7 14-7l5 5-8 3c-4 7-11 16-21 22-8 5-17 3-28 3Z"
      />
      <circle cx="52" cy="13.5" r="1.4" className="fill-background" />
    </svg>
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
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className={markClassName} />
      {!compact && (
        <div className="min-w-0 leading-none">
          <p className="font-display text-base font-semibold tracking-[0.18em]">
            DARA<span className="text-primary">V</span>EN
          </p>
          <p className="mt-1 text-[10px] font-medium tracking-[0.42em] text-primary">ERP</p>
        </div>
      )}
    </div>
  );
}
