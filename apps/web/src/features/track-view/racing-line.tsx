import type { Layout, RacingLine } from "@track-day/schema";

/**
 * The racing line to draw for a layout. Today only manually traced lines
 * exist (`layout.racingLine`); future sources (Assetto Corsa fast_lane.ai,
 * telemetry) plug in here and the layer below stays unchanged.
 */
export function getRacingLine(layout: Pick<Layout, "racingLine">): RacingLine | null {
  return layout.racingLine;
}

/** Drawn inside the canvas' rotated group, in the outline's coordinate space. */
export function RacingLineLayer({ line }: { line: RacingLine }) {
  return (
    <path
      d={line.path}
      fill="none"
      className="stroke-racing-line"
      strokeWidth={2.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      data-testid="racing-line"
      data-source={line.source}
    />
  );
}
