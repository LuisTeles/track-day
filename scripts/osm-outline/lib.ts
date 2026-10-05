// Pure helpers for turning OpenStreetMap raceway ways into a normalized track
// outline. No I/O here; see index.ts for fetching and writing.

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags: Record<string, string>;
}

export type OsmElement = OsmNode | OsmWay;

export interface Point {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversine(a: OsmNode, b: OsmNode): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Graph & cycle search
// ---------------------------------------------------------------------------

interface Chain {
  /** Node ids from one junction to another (inclusive). */
  nodes: number[];
  wayIds: Set<number>;
  length: number;
}

export interface Cycle {
  nodes: number[];
  wayIds: Set<number>;
  length: number;
}

/**
 * Finds simple cycles in the raceway network, contracting degree-2 nodes into
 * chains first so the search runs over junctions only. Only cycles through
 * `mustInclude` (when given) and no longer than `maxLength` are returned.
 */
export function findCycles(
  ways: OsmWay[],
  nodes: Map<number, OsmNode>,
  opts: { maxLength: number; mustInclude?: number },
): Cycle[] {
  const adjacency = new Map<number, Map<number, number>>(); // node -> neighbor -> wayId
  for (const way of ways) {
    for (let i = 1; i < way.nodes.length; i++) {
      const a = way.nodes[i - 1]!;
      const b = way.nodes[i]!;
      if (a === b) continue;
      if (!adjacency.has(a)) adjacency.set(a, new Map());
      if (!adjacency.has(b)) adjacency.set(b, new Map());
      adjacency.get(a)!.set(b, way.id);
      adjacency.get(b)!.set(a, way.id);
    }
  }

  const isJunction = (n: number) => adjacency.get(n)!.size !== 2 || n === opts.mustInclude;
  let junctions = [...adjacency.keys()].filter(isJunction);
  // A component that is a single ring has no junctions; pick any node of it.
  if (junctions.length === 0 && adjacency.size > 0) junctions = [adjacency.keys().next().value!];
  const junctionSet = new Set(junctions);

  // Walk every chain between junctions.
  const chainsFrom = new Map<number, Chain[]>();
  const seenEdges = new Set<string>();
  for (const start of junctions) {
    for (const [next, wayId] of adjacency.get(start)!) {
      if (seenEdges.has(`${start}>${next}`)) continue;
      const chain: Chain = { nodes: [start], wayIds: new Set([wayId]), length: 0 };
      let prev = start;
      let cur = next;
      for (;;) {
        seenEdges.add(`${prev}>${cur}`);
        seenEdges.add(`${cur}>${prev}`);
        chain.nodes.push(cur);
        chain.length += haversine(nodes.get(prev)!, nodes.get(cur)!);
        chain.wayIds.add(adjacency.get(prev)!.get(cur)!);
        if (junctionSet.has(cur)) break;
        const [onward] = [...adjacency.get(cur)!.keys()].filter((n) => n !== prev);
        if (onward === undefined) break; // dead end that wasn't a junction (shouldn't happen)
        prev = cur;
        cur = onward;
      }
      const end = chain.nodes[chain.nodes.length - 1]!;
      const reversed: Chain = { ...chain, nodes: [...chain.nodes].reverse() };
      (chainsFrom.get(start) ?? chainsFrom.set(start, []).get(start)!).push(chain);
      if (end !== start) (chainsFrom.get(end) ?? chainsFrom.set(end, []).get(end)!).push(reversed);
    }
  }

  // DFS over junctions from each start, keeping each cycle once.
  const cycles: Cycle[] = [];
  const seen = new Set<string>();
  const starts = opts.mustInclude !== undefined ? [opts.mustInclude] : junctions;
  for (const start of starts) {
    const stack: { at: number; path: Chain[]; visited: Set<number>; length: number }[] = [
      { at: start, path: [], visited: new Set([start]), length: 0 },
    ];
    while (stack.length > 0) {
      const { at, path, visited, length } = stack.pop()!;
      for (const chain of chainsFrom.get(at) ?? []) {
        if (path.length > 0 && chain === path[path.length - 1]) continue;
        const end = chain.nodes[chain.nodes.length - 1]!;
        const total = length + chain.length;
        if (total > opts.maxLength) continue;
        if (end === start) {
          const all = [...path, chain];
          const nodeSeq = all.flatMap((c, i) => (i === 0 ? c.nodes : c.nodes.slice(1)));
          const key = canonicalKey(nodeSeq.slice(0, -1));
          if (seen.has(key)) continue;
          seen.add(key);
          cycles.push({
            nodes: nodeSeq.slice(0, -1),
            wayIds: new Set(all.flatMap((c) => [...c.wayIds])),
            length: total,
          });
        } else if (!visited.has(end)) {
          stack.push({
            at: end,
            path: [...path, chain],
            visited: new Set([...visited, end]),
            length: total,
          });
        }
      }
    }
  }
  return cycles;
}

/** Same key for a cycle regardless of start point or direction. */
function canonicalKey(ring: number[]): string {
  const sorted = [...ring].sort((a, b) => a - b);
  return sorted.join(",");
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Equirectangular projection around the ring's centroid, in meters, y down (screen). */
export function project(ring: OsmNode[]): Point[] {
  const lat0 = ring.reduce((s, n) => s + n.lat, 0) / ring.length;
  const lon0 = ring.reduce((s, n) => s + n.lon, 0) / ring.length;
  const k = (Math.PI / 180) * EARTH_RADIUS_M;
  return ring.map((n) => ({
    x: (n.lon - lon0) * k * Math.cos((lat0 * Math.PI) / 180),
    y: -(n.lat - lat0) * k,
  }));
}

/** Shoelace area; in screen coords (y down) a positive value means clockwise. */
export function signedAreaScreen(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function cumulativeLengths(points: Point[], closed: boolean): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(
      out[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y),
    );
  }
  if (closed) {
    const last = points[points.length - 1]!;
    const first = points[0]!;
    out.push(out[out.length - 1]! + Math.hypot(first.x - last.x, first.y - last.y));
  }
  return out;
}

/** Douglas–Peucker on an open polyline (endpoints kept). */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Scales so the longest side is `size` and the top-left corner is at 0,0. */
export function normalize(points: Point[], size: number): Point[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const scale = size / Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  return points.map((p) => ({ x: (p.x - minX) * scale, y: (p.y - minY) * scale }));
}

/**
 * Sum of turning angles along a polyline, in screen coordinates (y down):
 * negative = turning left, positive = turning right.
 */
export function turning(points: Point[]): number {
  let total = 0;
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2]!;
    const b = points[i - 1]!;
    const c = points[i]!;
    const h1 = Math.atan2(b.y - a.y, b.x - a.x);
    const h2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = h2 - h1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return total;
}

export function toPathData(points: Point[], closed: boolean): string {
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  const body = points.map((p, i) => `${i === 0 ? "M" : "L"}${f(p.x)} ${f(p.y)}`).join(" ");
  return closed ? `${body} Z` : body;
}

/**
 * An illustrative racing line for sample data: the closed outline smoothed
 * with a moving average (which cuts toward the apexes), with every point kept
 * within `maxOffset` of the centerline so it stays on the asphalt. Not a real
 * racing line.
 */
export function illustrativeRacingLine(
  ring: Point[],
  step: number,
  window: number,
  maxOffset: number,
): Point[] {
  // Resample the closed ring at a fixed spacing.
  const closed = [...ring, ring[0]!];
  const cumulative = cumulativeLengths(closed, false);
  const total = cumulative[cumulative.length - 1]!;
  const samples: Point[] = [];
  let seg = 0;
  for (let d = 0; d < total; d += step) {
    while (cumulative[seg + 1]! < d) seg++;
    const a = closed[seg]!;
    const b = closed[seg + 1]!;
    const t = (d - cumulative[seg]!) / (cumulative[seg + 1]! - cumulative[seg]! || 1);
    samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }

  const n = samples.length;
  const half = Math.max(1, Math.round(window / step));
  return samples.map((p, i) => {
    let sx = 0;
    let sy = 0;
    for (let j = -half; j <= half; j++) {
      const q = samples[(i + j + n) % n]!;
      sx += q.x;
      sy += q.y;
    }
    const avg = { x: sx / (2 * half + 1), y: sy / (2 * half + 1) };
    const dx = avg.x - p.x;
    const dy = avg.y - p.y;
    const len = Math.hypot(dx, dy);
    const k = len > maxOffset ? maxOffset / len : 1;
    return { x: p.x + dx * k, y: p.y + dy * k };
  });
}
