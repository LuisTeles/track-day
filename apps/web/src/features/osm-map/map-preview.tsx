import { useMemo, type MouseEvent } from "react";
import { boundsOf } from "@/features/track-view/geometry/bounds";
import { createTrackPath, type TrackPath } from "@/features/track-view/geometry/path";
import type { Point } from "@/features/track-view/geometry/types";
import type { MatchedCorner } from "./match-corners";

/** The lap fraction (0–1) of the outline point closest to `p`, to within 1/`samples`. */
export function nearestFraction(path: TrackPath, p: Point, samples = 1000): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < samples; i++) {
    const q = path.pointAt(i / samples);
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i / samples;
    }
  }
  return best;
}

/**
 * A look at an outline with the layout's corners on it and the start line
 * marked. With `onPickStart`, tapping the outline reports where it was tapped.
 */
export function MapPreview({
  outlinePath,
  matched,
  label,
  onPickStart,
}: {
  outlinePath: string;
  matched: MatchedCorner[];
  label: string;
  /** Called with the lap fraction nearest a tap, measured along this outline. */
  onPickStart?: (fraction: number) => void;
}) {
  const path = useMemo(() => createTrackPath(outlinePath), [outlinePath]);
  const b = useMemo(() => boundsOf(path.sample(200)), [path]);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const pad = size * 0.08;
  const r = size * 0.025;
  const start = path.pointAt(0);
  const tangent = path.tangentAt(0);
  const half = size * 0.035;

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    if (!onPickStart) return;
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM?.();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    onPickStart(nearestFraction(path, { x: p.x, y: p.y }));
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`}
      className={`aspect-square w-full rounded-lg bg-canvas ${onPickStart ? "cursor-crosshair" : ""}`}
      onClick={handleClick}
    >
      <path d={outlinePath} fill="none" className="stroke-track" strokeWidth={size * 0.012} />
      {/* Start/finish: a bar across the track at the start of the lap. */}
      <line
        data-preview-start
        x1={start.x - tangent.y * half}
        y1={start.y + tangent.x * half}
        x2={start.x + tangent.y * half}
        y2={start.y - tangent.x * half}
        className="stroke-accent"
        strokeWidth={size * 0.01}
      />
      {matched.map(({ corner, source, fraction }) => {
        if (fraction === null) return null;
        const p = path.pointAt(fraction);
        return (
          <g key={corner.id} data-preview-corner={source}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              className={source === "osm" || source === "name" ? "fill-marker" : "fill-muted"}
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
