import type { Corner, Layout } from "@track-day/schema";
import { useMemo } from "react";
import { cornerFraction } from "@/features/track-view/geometry/anchors";
import { fitToViewport } from "@/features/track-view/geometry/fit";
import { useTrackGeometry } from "@/features/track-view/use-track-geometry";

const SIZE = { width: 400, height: 300 };
const SAMPLES = 400;
const R = 9;

/** Static, unzoomable outline with numbered corner circles, for printing. */
export function PrintMap({
  outlinePath,
  layout,
  corners,
  label,
}: {
  outlinePath: string;
  layout: Pick<Layout, "lengthMeters" | "rotation">;
  corners: Corner[];
  label: string;
}) {
  const geometry = useTrackGeometry(outlinePath, layout.rotation ?? 0);
  const { line, dots } = useMemo(() => {
    const fit = fitToViewport(geometry.bounds, SIZE, 24);
    const at = (f: number) => {
      const p = geometry.pointAt(f);
      return { x: p.x * fit.k + fit.x, y: p.y * fit.k + fit.y };
    };
    const points = Array.from({ length: SAMPLES + 1 }, (_, i) => at(i / SAMPLES));
    return {
      line: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      dots: corners.flatMap((c) => {
        const f = cornerFraction(c, layout);
        return f == null ? [] : [{ id: c.id, number: c.number, ...at(f) }];
      }),
    };
  }, [geometry, corners, layout]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
      className="h-auto w-full max-w-md"
    >
      <polyline
        points={line}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {dots.map((d) => (
        <g key={d.id} aria-hidden>
          <circle cx={d.x} cy={d.y} r={R} fill="var(--accent)" stroke="var(--background)" />
          <text
            x={d.x}
            y={d.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={d.number > 9 ? 9 : 11}
            fontWeight={600}
            fill="var(--accent-foreground)"
          >
            {d.number}
          </text>
        </g>
      ))}
    </svg>
  );
}
