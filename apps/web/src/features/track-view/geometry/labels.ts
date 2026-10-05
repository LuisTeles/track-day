import type { Point, Size } from "./types";

export interface LabelInput {
  id: string;
  /** Screen position of the corner on the track. */
  anchor: Point;
  size: Size;
  /** Unit vector pointing away from the track (screen space), preferred push direction. */
  outward: Point;
  /** Manual placement relative to the anchor; skips automatic placement. */
  offset?: { dx: number; dy: number } | null;
}

export interface PlacedLabel {
  id: string;
  /** Center of the label box. */
  center: Point;
  /** Center of the label's leading square (the numbered badge). */
  badge: Point;
  /** True when the label sits away from its anchor and needs a leader line. */
  leader: boolean;
}

export interface PlaceOptions {
  /** Gap kept between label boxes, in px. */
  gap?: number;
  /** Distances from the anchor to try when the anchor itself is taken. */
  distances?: readonly number[];
  /** Angles (degrees) off the outward direction to try at each distance. */
  angles?: readonly number[];
  /** Keep labels inside this area (e.g. the viewport); spill-over counts as overlap. */
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boxAt = (center: Point, size: Size, gap: number): Box => ({
  minX: center.x - size.width / 2 - gap / 2,
  minY: center.y - size.height / 2 - gap / 2,
  maxX: center.x + size.width / 2 + gap / 2,
  maxY: center.y + size.height / 2 + gap / 2,
});

/** Area of `box` outside `bounds`, weighted so leaving the screen is worse than touching a neighbour. */
const spillArea = (box: Box, bounds: Box | undefined) => {
  if (!bounds) return 0;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const insideW = Math.max(0, Math.min(box.maxX, bounds.maxX) - Math.max(box.minX, bounds.minX));
  const insideH = Math.max(0, Math.min(box.maxY, bounds.maxY) - Math.max(box.minY, bounds.minY));
  return (width * height - insideW * insideH) * 4;
};

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
  Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));

/**
 * Labels are a square badge (height × height) followed by optional text to
 * its right. Returns the box center that puts the badge's center at `point`.
 */
const centerForBadgeAt = (point: Point, size: Size): Point => ({
  x: point.x + (size.width - size.height) / 2,
  y: point.y,
});

/**
 * Greedy, deterministic label placement. In input order, each label goes on
 * its anchor (badge centered on it) if free; otherwise it is pushed outward from the track at
 * increasing distances, trying angles around the outward direction, and gets
 * a leader line back to the anchor. If nothing is free, the least-overlapping
 * candidate wins.
 */
export function placeLabels(
  inputs: readonly LabelInput[],
  options: PlaceOptions = {},
): PlacedLabel[] {
  const gap = options.gap ?? 4;
  const distances = options.distances ?? [28, 40, 54, 70, 90, 114];
  const angles = options.angles ?? [0, 25, -25, 50, -50, 80, -80, 115, -115, 150, -150, 180];
  const placed: Box[] = [];

  return inputs.map((input) => {
    if (input.offset) {
      const center = { x: input.anchor.x + input.offset.dx, y: input.anchor.y + input.offset.dy };
      placed.push(boxAt(center, input.size, gap));
      const moved = Math.hypot(input.offset.dx, input.offset.dy);
      return {
        id: input.id,
        center,
        badge: badgeOf(center, input.size),
        leader: moved > Math.max(input.size.width, input.size.height) / 2,
      };
    }

    const candidates: { center: Point; leader: boolean }[] = [
      { center: centerForBadgeAt(input.anchor, input.size), leader: false },
    ];
    const base = Math.atan2(input.outward.y, input.outward.x);
    for (const d of distances) {
      for (const a of angles) {
        const r = base + (a * Math.PI) / 180;
        candidates.push({
          center: { x: input.anchor.x + Math.cos(r) * d, y: input.anchor.y + Math.sin(r) * d },
          leader: true,
        });
      }
    }

    let best = candidates[0]!;
    let bestOverlap = Infinity;
    for (const candidate of candidates) {
      const box = boxAt(candidate.center, input.size, gap);
      const overlap =
        placed.reduce((sum, other) => sum + overlapArea(box, other), 0) +
        spillArea(box, options.bounds);
      if (overlap === 0) {
        best = candidate;
        bestOverlap = 0;
        break;
      }
      if (overlap < bestOverlap) {
        best = candidate;
        bestOverlap = overlap;
      }
    }

    placed.push(boxAt(best.center, input.size, gap));
    return {
      id: input.id,
      center: best.center,
      badge: badgeOf(best.center, input.size),
      leader: best.leader,
    };
  });
}

const badgeOf = (center: Point, size: Size): Point => ({
  x: center.x - (size.width - size.height) / 2,
  y: center.y,
});

/** Unit vector perpendicular to `tangent`, on the side facing away from `centroid`. */
export function outwardNormal(point: Point, tangent: Point, centroid: Point): Point {
  const normal = { x: -tangent.y, y: tangent.x };
  const away = { x: point.x - centroid.x, y: point.y - centroid.y };
  return normal.x * away.x + normal.y * away.y >= 0 ? normal : { x: -normal.x, y: -normal.y };
}
