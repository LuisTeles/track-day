import type { Corner } from "@track-day/schema";
import { boundsOf, rotatePoint } from "@/features/track-view/geometry/bounds";
import type { TrackPath } from "@/features/track-view/geometry/path";
import type { Bounds, Point } from "@/features/track-view/geometry/types";

/** Positions along the lap (0–1) for one corner of the step. */
export interface CornerPositions {
  apex: number;
  turnIn?: number | null;
  exit?: number | null;
}

export interface DiagramInput {
  path: TrackPath;
  lengthMeters: number;
  /** In lap order; a complex has several. */
  corners: CornerPositions[];
  /** Distance-board value: meters before the first corner's turn-in (ADR-006). */
  brakeMeters?: number | null;
  racingLine?: TrackPath | null;
}

export interface DiagramMarker {
  kind: "brake" | "turn-in" | "apex" | "exit";
  point: Point;
  /** Brake measured from the apex because turn-in is unknown. */
  approximate?: boolean;
  /** Direction across the track (unit), for drawing the brake bar. */
  normal?: Point;
}

export interface Diagram {
  /** Centerline slice, rotated so the approach points up (screen y-down). */
  centerline: Point[];
  racingLine: Point[] | null;
  markers: DiagramMarker[];
  bounds: Bounds;
  unitsPerMeter: number;
  schematic: boolean;
}

export const APPROACH_METERS = 150;
export const EXIT_METERS = 120;
const STEP_METERS = 2;

const wrap = (f: number) => ((f % 1) + 1) % 1;

/**
 * Slices the real track around a corner (or complex): from the brake point
 * (or a default approach) to past the exit, oriented so you drive "up the
 * screen" into it, like looking ahead from the car.
 */
export function cornerDiagram({
  path,
  lengthMeters,
  corners,
  brakeMeters,
  racingLine,
}: DiagramInput): Diagram {
  const first = corners[0]!;
  const last = corners[corners.length - 1]!;
  const toFraction = (meters: number) => meters / lengthMeters;
  const unitsPerMeter = path.length / lengthMeters;

  // Work in unwrapped fractions so a slice can cross the start/finish line.
  const entry = first.turnIn ?? first.apex;
  const brake = brakeMeters != null ? entry - toFraction(brakeMeters) : null;
  const start = Math.min(brake ?? Infinity, first.apex - toFraction(APPROACH_METERS));
  let end = (last.exit ?? last.apex) + toFraction(EXIT_METERS);
  if (end < start) end += 1;

  const sampleCount = Math.max(2, Math.ceil(((end - start) * lengthMeters) / STEP_METERS));
  const raw = Array.from({ length: sampleCount + 1 }, (_, i) =>
    path.pointAt(wrap(start + ((end - start) * i) / sampleCount)),
  );

  // Rotate about the slice start so the approach direction points up (−y).
  const tangent = path.tangentAt(wrap(start));
  const angle = (-90 - (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI) % 360;
  const origin = raw[0]!;
  const orient = (p: Point) => rotatePoint(p, angle, origin);
  const at = (f: number) => orient(path.pointAt(wrap(f)));
  const normalAt = (f: number) => {
    const t = rotatePoint(path.tangentAt(wrap(f)), angle, { x: 0, y: 0 });
    return { x: -t.y, y: t.x };
  };

  const markers: DiagramMarker[] = [];
  if (brake !== null) {
    markers.push({
      kind: "brake",
      point: at(brake),
      approximate: first.turnIn == null,
      normal: normalAt(brake),
    });
  }
  for (const c of corners) {
    if (c.turnIn != null) markers.push({ kind: "turn-in", point: at(c.turnIn) });
    markers.push({ kind: "apex", point: at(c.apex) });
    if (c.exit != null) markers.push({ kind: "exit", point: at(c.exit) });
  }

  const centerline = raw.map(orient);
  return {
    centerline,
    racingLine: racingLine
      ? sliceNear(racingLine, raw[0]!, raw[raw.length - 1]!).map(orient)
      : null,
    markers,
    bounds: boundsOf(centerline),
    unitsPerMeter,
    schematic: false,
  };
}

/** The part of `line` between the points nearest to `from` and `to`, in its own direction. */
function sliceNear(line: TrackPath, from: Point, to: Point): Point[] {
  const samples = 1500;
  const nearest = (p: Point) => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < samples; i++) {
      const q = line.pointAt(i / samples);
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i / samples;
      }
    }
    return best;
  };
  const a = nearest(from);
  let b = nearest(to);
  if (b < a) b += 1;
  const n = Math.max(2, Math.ceil((b - a) * samples));
  return Array.from({ length: n + 1 }, (_, i) => line.pointAt(wrap(a + ((b - a) * i) / n)));
}

/**
 * A generic corner shape for layouts without an outline: approach up the
 * screen, then a turn whose angle depends on the corner type, mirrored for
 * right-handers. Labelled "schematic" wherever it's shown.
 */
export function schematicDiagram(type: Corner["type"], direction: Corner["direction"]): Diagram {
  const turnDegrees = { hairpin: 180, chicane: 0, sweeper: 90, kink: 25, esses: 0, corner: 90 }[
    type ?? "corner"
  ];
  const sign = direction === "right" ? 1 : -1;
  const points: Point[] = [];
  let p = { x: 0, y: 0 };
  let heading = -90; // up
  const step = (length: number, turn: number, steps: number) => {
    for (let i = 0; i < steps; i++) {
      heading += (turn / steps) * sign;
      const r = (heading * Math.PI) / 180;
      p = { x: p.x + Math.cos(r) * (length / steps), y: p.y + Math.sin(r) * (length / steps) };
      points.push(p);
    }
  };
  points.push(p);
  step(120, 0, 10);
  const apexIndex = points.length;
  if (type === "chicane" || type === "esses") {
    step(50, 50, 12);
    step(50, -100, 16);
    step(50, 50, 12);
  } else {
    step(Math.max(60, turnDegrees * 0.8), turnDegrees, 30);
  }
  const apex =
    points[Math.min(points.length - 1, apexIndex + Math.floor((points.length - apexIndex) / 2))]!;
  step(80, 0, 8);
  return {
    centerline: points,
    racingLine: null,
    markers: [{ kind: "apex", point: apex }],
    bounds: boundsOf(points),
    unitsPerMeter: 1,
    schematic: true,
  };
}
