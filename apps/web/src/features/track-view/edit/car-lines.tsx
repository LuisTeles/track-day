import type { Corner, CornerGuide } from "@track-day/schema";
import { cornerFraction } from "../geometry/anchors";
import { cornerLine, pointsToPath } from "../geometry/corner-line";
import { createTrackPath } from "../geometry/path";

export interface CarLine {
  cornerId: string;
  d: string;
  estimated: boolean;
}

/** Generated lines for the corners where the car has turn-in/apex/exit points. */
export function carLines({
  outlinePath,
  lengthMeters,
  corners,
  cornerGuides,
}: {
  outlinePath: string;
  lengthMeters: number | null;
  corners: Corner[];
  cornerGuides: CornerGuide[];
}): CarLine[] {
  if (!lengthMeters) return [];
  const path = createTrackPath(outlinePath);
  const byCorner = new Map(cornerGuides.map((g) => [g.cornerId, g]));
  const lines: CarLine[] = [];
  for (const corner of corners) {
    const line = byCorner.get(corner.id)?.line;
    if (!line || (line.turnInAt ?? line.apexAt ?? line.exitAt) == null) continue;
    const generated = cornerLine({
      path,
      lengthMeters,
      corners: [
        {
          direction: corner.direction,
          turnIn: line.turnInAt,
          apex: line.apexAt ?? cornerFraction(corner, { lengthMeters }),
          exit: line.exitAt,
        },
      ],
    });
    if (generated) {
      lines.push({
        cornerId: corner.id,
        d: pointsToPath(generated.points),
        // No apex of its own: the corner's position stands in, so it's a guess too.
        estimated: generated.estimated || line.apexAt == null,
      });
    }
  }
  return lines;
}

/** Drawn inside the canvas' rotated group, like the layout's racing line. */
export function CarLinesLayer({ lines }: { lines: CarLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <path
          key={l.cornerId}
          d={l.d}
          fill="none"
          className="stroke-racing-line"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={l.estimated ? "6 4" : undefined}
          vectorEffect="non-scaling-stroke"
          data-testid="car-line"
        />
      ))}
    </>
  );
}
