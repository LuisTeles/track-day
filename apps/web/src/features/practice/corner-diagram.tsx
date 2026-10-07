import type { Diagram } from "./diagram-geometry";

const TRACK_WIDTH_M = 13;

interface CornerDiagramProps {
  diagram: Diagram;
  /** Labels for the apex markers, in order (e.g. ["T1", "T2"]). */
  apexLabels: string[];
  /** e.g. "100 m"; shown next to the brake bar. */
  brakeLabel: string | null;
}

/**
 * The corner as you approach it: real geometry at real width, driving up the
 * screen, with brake, turn-in, apex and exit markers and the racing line.
 */
export function CornerDiagram({ diagram, apexLabels, brakeLabel }: CornerDiagramProps) {
  const { bounds, unitsPerMeter, centerline } = diagram;
  const width = TRACK_WIDTH_M * unitsPerMeter;
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const pad = Math.max(width * 2, size * 0.12);
  const font = size * 0.06;
  // Leave room on both sides for the brake label next to the bar.
  const labelRoom = brakeLabel ? (brakeLabel.length + 2) * font * 0.62 + width : 0;
  const padX = Math.max(pad, labelRoom);
  const viewBox = [
    bounds.minX - padX,
    bounds.minY - pad,
    bounds.maxX - bounds.minX + 2 * padX,
    bounds.maxY - bounds.minY + 2 * pad,
  ];
  const line = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  let apexIndex = 0;

  return (
    <figure
      className="relative h-full min-h-0 w-full"
      data-testid="corner-diagram"
      data-schematic={diagram.schematic}
    >
      <svg
        viewBox={viewBox.join(" ")}
        className="h-full w-full"
        role="img"
        aria-label="Corner diagram"
      >
        <path
          d={line(centerline)}
          fill="none"
          className="stroke-track-edge"
          strokeWidth={width * 1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={line(centerline)}
          fill="none"
          className="stroke-track"
          strokeWidth={width}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={line(centerline)}
          fill="none"
          className="stroke-track-line"
          strokeWidth={width * 0.05}
          strokeDasharray={`${width * 0.6} ${width * 0.6}`}
        />
        {diagram.racingLine && (
          <path
            d={line(diagram.racingLine)}
            fill="none"
            className="stroke-racing-line"
            strokeWidth={width * 0.18}
            strokeLinecap="round"
            data-testid="diagram-racing-line"
            data-source={diagram.lineSource ?? undefined}
          />
        )}

        {diagram.markers.map((m, i) => {
          if (m.kind === "brake" && m.normal) {
            const half = width * 0.75;
            return (
              <g key={i} data-marker="brake">
                <line
                  x1={m.point.x - m.normal.x * half}
                  y1={m.point.y - m.normal.y * half}
                  x2={m.point.x + m.normal.x * half}
                  y2={m.point.y + m.normal.y * half}
                  className="stroke-pressure"
                  strokeWidth={width * 0.28}
                  strokeDasharray={m.approximate ? `${width * 0.3} ${width * 0.2}` : undefined}
                />
                <text
                  x={m.point.x + m.normal.x * (half + font * 0.4)}
                  y={m.point.y + font * 0.35}
                  fontSize={font}
                  className="fill-pressure font-bold"
                  textAnchor={m.normal.x >= 0 ? "start" : "end"}
                >
                  {m.approximate ? "≈ " : ""}
                  {brakeLabel ?? "Brake"}
                </text>
              </g>
            );
          }
          if (m.kind === "apex") {
            const label = apexLabels[apexIndex++] ?? "Apex";
            return (
              <g key={i} data-marker="apex">
                <circle cx={m.point.x} cy={m.point.y} r={width * 0.55} className="fill-accent" />
                <text
                  x={m.point.x}
                  y={m.point.y - width * 0.9}
                  fontSize={font}
                  textAnchor="middle"
                  className="fill-foreground font-bold"
                >
                  {label}
                </text>
              </g>
            );
          }
          return (
            <circle
              key={i}
              data-marker={m.kind}
              cx={m.point.x}
              cy={m.point.y}
              r={width * 0.35}
              fill="none"
              className="stroke-foreground"
              strokeWidth={width * 0.12}
            />
          );
        })}
      </svg>
      {diagram.schematic && (
        <figcaption className="absolute top-2 left-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
          Schematic
        </figcaption>
      )}
    </figure>
  );
}
