/**
 * Lightweight isometric "3D" illustrations for empty states.
 * Inline SVG + CSS tilt — no images, no runtime cost.
 */
export type IllustrationKind = "inventory" | "sales" | "finance" | "people" | "generic";

function Iso({ children }: { children: React.ReactNode }) {
  return (
    <div className="scene-3d">
      <svg
        viewBox="0 0 160 120"
        className="tilt-3d h-28 w-40 drop-shadow-md"
        role="presentation"
        aria-hidden
      >
        <defs>
          <linearGradient id="isoTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id="isoSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <ellipse
          cx="80"
          cy="104"
          rx="52"
          ry="10"
          fill="hsl(var(--muted-foreground))"
          opacity="0.14"
        />
        {children}
      </svg>
    </div>
  );
}

function Box({
  x,
  y,
  w = 34,
  h = 18,
  d = 12,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  d?: number;
}) {
  return (
    <g>
      <polygon
        points={`${x},${y} ${x + w / 2},${y - d} ${x + w},${y} ${x + w / 2},${y + d}`}
        fill="url(#isoTop)"
      />
      <polygon
        points={`${x},${y} ${x + w / 2},${y + d} ${x + w / 2},${y + d + h} ${x},${y + h}`}
        fill="url(#isoSide)"
      />
      <polygon
        points={`${x + w},${y} ${x + w / 2},${y + d} ${x + w / 2},${y + d + h} ${x + w},${y + h}`}
        fill="hsl(var(--primary))"
        opacity="0.35"
      />
    </g>
  );
}

export function EmptyIllustration({ kind = "generic" }: { kind?: IllustrationKind }) {
  if (kind === "inventory")
    return (
      <Iso>
        <Box x={44} y={62} />
        <Box x={26} y={44} w={30} h={14} d={10} />
        <Box x={70} y={40} w={30} h={14} d={10} />
      </Iso>
    );

  if (kind === "sales")
    return (
      <Iso>
        <Box x={40} y={70} w={70} h={10} d={18} />
        <g opacity="0.95">
          <rect x="52" y="38" width="14" height="26" rx="2" fill="url(#isoSide)" />
          <rect x="72" y="26" width="14" height="38" rx="2" fill="url(#isoTop)" />
          <rect x="92" y="46" width="14" height="18" rx="2" fill="url(#isoSide)" />
        </g>
      </Iso>
    );

  if (kind === "finance")
    return (
      <Iso>
        <Box x={46} y={72} w={60} h={8} d={14} />
        <g>
          <ellipse cx="76" cy="58" rx="26" ry="10" fill="url(#isoTop)" />
          <ellipse cx="76" cy="48" rx="26" ry="10" fill="url(#isoSide)" />
          <ellipse cx="76" cy="38" rx="26" ry="10" fill="url(#isoTop)" />
        </g>
      </Iso>
    );

  if (kind === "people")
    return (
      <Iso>
        <Box x={44} y={74} w={62} h={8} d={14} />
        <circle cx="64" cy="42" r="11" fill="url(#isoTop)" />
        <circle cx="92" cy="48" r="9" fill="url(#isoSide)" />
        <path d="M46 70c4-13 14-18 18-18s14 5 18 18z" fill="url(#isoSide)" opacity="0.8" />
      </Iso>
    );

  return (
    <Iso>
      <Box x={54} y={58} w={52} h={20} d={16} />
    </Iso>
  );
}
