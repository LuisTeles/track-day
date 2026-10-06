import { useMemo } from "react";
import { boundsOf } from "@/features/track-view/geometry/bounds";
import { createTrackPath } from "@/features/track-view/geometry/path";
import type { MatchedCorner } from "./match-corners";

/** A static, non-interactive look at an outline with the layout's corners on it. */
export function MapPreview({
  outlinePath,
  matched,
  label,
}: {
  outlinePath: string;
  matched: MatchedCorner[];
  label: string;
}) {
  const path = useMemo(() => createTrackPath(outlinePath), [outlinePath]);
  const b = useMemo(() => boundsOf(path.sample(200)), [path]);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const pad = size * 0.08;
  const r = size * 0.025;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`}
      className="aspect-square w-full rounded-lg bg-canvas"
    >
      <path d={outlinePath} fill="none" className="stroke-track" strokeWidth={size * 0.012} />
      {matched.map(({ corner, source, fraction }) => {
        if (fraction === null) return null;
        const p = path.pointAt(fraction);
        return (
          <g key={corner.id} data-preview-corner={source}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              className={source === "osm" ? "fill-marker" : "fill-muted"}
            />
            <text
              x={p.x}
              y={p.y}
              dy="0.35em"
              textAnchor="middle"
              fontSize={r * 1.1}
              className="fill-marker-foreground font-semibold"
            >
              {corner.number}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
