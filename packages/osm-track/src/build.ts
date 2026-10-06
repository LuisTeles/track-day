import {
  findCyclesBounded,
  geometryOf,
  longestIncreasing,
  nearestByDistance,
  normalize,
  onewayVotes,
  project,
  rotate,
  round,
  signedAreaScreen,
  simplify,
  toPathData,
  turning,
  type LoopGeometry,
  type OsmElement,
  type OsmNode,
  type OsmWay,
} from "./lib";

const SIZE = 1000;
/** Loops within this share of the official length are preferred (the script's old limit). */
const STRICT = 0.05;
/** Loops within this share are still offered, for a wrong lap length. */
const LOOSE = 0.15;
const MAX_LOOPS = 5;
/** Search steps before giving up on a dense network (~0.2 s); real circuits need ~50k. */
const SEARCH_BUDGET = 1_000_000;

export interface BuildOptions {
  lengthMeters: number;
  direction: "clockwise" | "anticlockwise";
  /** Which of `loops` to build (default 0, the best match). */
  loopIndex?: number;
  /**
   * Restart the lap at this fraction (0–1) of the outline as it would be built
   * without it: for circuits whose start line isn't tagged, picked by the user.
   */
  startAt?: number;
  /** Corner names from way tags; defaults to `name`. */
  nameOf?: (tags: Record<string, string>) => string | undefined;
}

/** A named stretch of the loop (e.g. "Variante del Rettifilo"), as lap fractions. */
export interface NamedSection {
  name: string;
  /** Other names the section is tagged with (old_name, alt_name, name:en). */
  aliases: string[];
  from: number;
  /** May be less than `from` when the section crosses the start line. */
  to: number;
}

export interface OsmCorner {
  number: number;
  name: string | null;
  /** Fraction of the lap (0–1) at the apex, rounded to 4 digits. */
  position: number;
  direction: "left" | "right";
}

export interface LoopOption {
  lengthMeters: number;
  taggedCorners: number;
}

export interface TrackGeometryResult {
  ok: true;
  /** ADR-005 space: longest side 1000, y down, from the start line in the driving direction. */
  outlinePath: string;
  loopLengthMeters: number;
  loops: LoopOption[];
  loopIndex: number;
  start: "tagged" | "approximate" | "arbitrary" | "chosen";
  direction: "oneway-tags" | "layout";
  /** OSM-tagged corners on the loop, by number. */
  corners: OsmCorner[];
  warnings: string[];
  /** Named ways on the loop, merged by name, measured from the start line. */
  sections: NamedSection[];
  /** Raw loop data for the CLI (segments, inferred corners, racing line). */
  loop: { ring: number[]; wayIds: Set<number>; nodes: Map<number, OsmNode>; ways: OsmWay[] };
}

export interface TrackGeometryFailure {
  ok: false;
  reason: "no-raceway" | "no-loop";
  /** Lengths (m) of the loops that were found, sorted. */
  loopsFound: number[];
}

const wrapFraction = (f: number) => ((f % 1) + 1) % 1;

/**
 * Rotates the ring to start `distance` meters along it. Start lines sit on
 * straights, where OSM nodes can be far apart, so an interpolated node is
 * inserted rather than snapping to the nearest real one.
 */
function restartAt(
  ring: number[],
  nodes: Map<number, OsmNode>,
  geo: LoopGeometry,
  distance: number,
) {
  let i = 0;
  while (i < ring.length - 1 && geo.cumulative[i + 1]! <= distance) i++;
  const from = geo.cumulative[i]!;
  const to = geo.cumulative[i + 1]!;
  let next = ring;
  let at = i;
  if (distance - from > 1 && to - distance > 1) {
    const a = nodes.get(ring[i]!)!;
    const b = nodes.get(ring[(i + 1) % ring.length]!)!;
    const t = (distance - from) / (to - from);
    const id = -1 - nodes.size; // synthetic ids never collide with OSM's positive ones
    nodes.set(id, {
      type: "node",
      id,
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
    });
    next = [...ring.slice(0, i + 1), id, ...ring.slice(i + 1)];
    at = i + 1;
  } else if (to - distance <= 1) {
    at = (i + 1) % ring.length;
  }
  next = rotate(next, at);
  return { ring: next, geo: geometryOf(next, nodes) };
}

const ALIAS_TAGS = ["old_name", "alt_name", "name:en", "name"];

function namedSections(
  loopWays: OsmWay[],
  geo: LoopGeometry,
  nameOf: (tags: Record<string, string>) => string | undefined,
): NamedSection[] {
  const byName = new Map<string, { aliases: Set<string>; indices: Set<number> }>();
  for (const way of loopWays) {
    const name = nameOf(way.tags);
    if (!name) continue;
    const entry = byName.get(name) ?? { aliases: new Set<string>(), indices: new Set<number>() };
    for (const key of ALIAS_TAGS) {
      const value = way.tags[key];
      if (value && value !== name) entry.aliases.add(value);
    }
    for (const id of way.nodes) {
      const i = geo.indexOf.get(id);
      if (i !== undefined) entry.indices.add(i);
    }
    byName.set(name, entry);
  }

  const n = geo.meters.length;
  const at = (i: number) => round(geo.cumulative[i]! / geo.total, 4) % 1;
  return [...byName].flatMap(([name, { aliases, indices }]) => {
    const sorted = [...indices].sort((a, b) => a - b);
    if (sorted.length < 2) return [];
    // The section is the loop minus its largest gap, so it may cross the start.
    let gapAfter = sorted.length - 1;
    let gap = sorted[0]! + n - sorted[sorted.length - 1]!;
    for (let k = 0; k < sorted.length - 1; k++) {
      const g = sorted[k + 1]! - sorted[k]!;
      if (g > gap) {
        gap = g;
        gapAfter = k;
      }
    }
    const first = sorted[(gapAfter + 1) % sorted.length]!;
    const last = sorted[gapAfter]!;
    return [{ name, aliases: [...aliases], from: at(first), to: at(last) }];
  });
}

function isExcluded(way: OsmWay): boolean {
  const t = way.tags;
  return (
    /pit/i.test(t.name ?? "") ||
    t.raceway === "pit_lane" ||
    t.service === "pit_lane" ||
    t.sport === "karting"
  );
}

export function buildTrackGeometry(
  elements: OsmElement[],
  options: BuildOptions,
): TrackGeometryResult | TrackGeometryFailure {
  const nameOf = options.nameOf ?? ((tags: Record<string, string>) => tags.name);
  const nodes = new Map<number, OsmNode>();
  for (const el of elements) if (el.type === "node") nodes.set(el.id, el);
  const ways = elements.filter(
    (el): el is OsmWay => el.type === "way" && el.tags?.highway === "raceway" && !isExcluded(el),
  );
  if (ways.length === 0) return { ok: false, reason: "no-raceway", loopsFound: [] };

  const startNode = ["Finish Line", "Start Line"]
    .map((name) => [...nodes.values()].find((n) => n.tags?.name === name))
    .find((n) => n && ways.some((w) => w.nodes.includes(n.id)));

  const target = options.lengthMeters;
  const search = findCyclesBounded(ways, nodes, {
    maxLength: target * (1 + LOOSE),
    mustInclude: startNode?.id,
    budget: SEARCH_BUDGET,
  });
  const cycles = search.cycles;
  const cornerWays = ways.filter((w) => w.tags["raceway:corner_number"]);
  const candidates = cycles
    .map((c) => ({
      cycle: c,
      covered: cornerWays.filter((w) => c.wayIds.has(w.id)).length,
      error: Math.abs(c.length - target) / target,
    }))
    .filter((c) => c.error < LOOSE)
    .sort(
      (a, b) =>
        Number(b.error < STRICT) - Number(a.error < STRICT) ||
        b.covered - a.covered ||
        a.error - b.error,
    )
    .slice(0, MAX_LOOPS);
  if (candidates.length === 0) {
    const loopsFound = [...new Set(cycles.map((c) => Math.round(c.length)))].sort((a, b) => a - b);
    return { ok: false, reason: "no-loop", loopsFound };
  }

  const loopIndex = Math.min(Math.max(options.loopIndex ?? 0, 0), candidates.length - 1);
  const best = candidates[loopIndex]!;
  const warnings: string[] = [];
  if (!search.complete) {
    warnings.push(
      "The raceway network here is too complex to search fully; the loops offered may not include the one you want",
    );
  }
  if (best.error > 0.02) {
    const pct = ((Math.abs(best.cycle.length - target) / target) * 100).toFixed(1);
    warnings.push(
      `The loop is ${pct}% ${best.cycle.length > target ? "longer" : "shorter"} than the layout length`,
    );
  }

  // Orient: start at the line, run in the driving direction.
  let ring = best.cycle.nodes;
  if (startNode) ring = rotate(ring, ring.indexOf(startNode.id));
  // OSM oneway tags encode the driving direction directly, and work for
  // figure-eights where the enclosed area doesn't.
  let direction: TrackGeometryResult["direction"] = "layout";
  const votes = onewayVotes(ring, ways);
  if (votes.agree + votes.disagree > 0) {
    if (votes.disagree > votes.agree) ring = [ring[0]!, ...ring.slice(1).reverse()];
    direction = "oneway-tags";
  } else {
    const clockwise = signedAreaScreen(project(ring.map((id) => nodes.get(id)!))) > 0;
    if (clockwise !== (options.direction === "clockwise")) {
      ring = [ring[0]!, ...ring.slice(1).reverse()];
    }
  }

  // Corner apexes (as node ids, so they survive re-rotating the ring):
  // the middle of each corner's tagged way(s) along the loop.
  const byNumber = new Map<number, OsmWay[]>();
  for (const w of cornerWays) {
    const n = Number(w.tags["raceway:corner_number"]);
    if (Number.isInteger(n) && n > 0) byNumber.set(n, [...(byNumber.get(n) ?? []), w]);
  }
  let geo = geometryOf(ring, nodes);
  const tagged: { number: number; apex: number; name: string | null; from: number; to: number }[] =
    [];
  for (const [number, waysForNumber] of byNumber) {
    const idx = waysForNumber
      .flatMap((w) => w.nodes)
      .map((id) => geo.indexOf.get(id))
      .filter((i): i is number => i !== undefined)
      .sort((x, y) => x - y);
    if (idx.length < 2) {
      warnings.push(`T${number} is tagged in OpenStreetMap but not on this loop`);
      continue;
    }
    const from = idx[0]!;
    const to = idx[idx.length - 1]!;
    tagged.push({
      number,
      apex: ring[
        nearestByDistance(
          geo.cumulative,
          from,
          to,
          (geo.cumulative[from]! + geo.cumulative[to]!) / 2,
        )
      ]!,
      name: waysForNumber.map((w) => nameOf(w.tags)).find(Boolean) ?? null,
      from: ring[from]!,
      to: ring[to]!,
    });
  }

  // Without a tagged line, start halfway between the last corner and T1.
  let start: TrackGeometryResult["start"] = startNode ? "tagged" : "arbitrary";
  if (!startNode) {
    const first = tagged.find((c) => c.number === 1);
    const last = tagged.reduce<(typeof tagged)[number] | undefined>(
      (m, c) => (!m || c.number > m.number ? c : m),
      undefined,
    );
    if (first && last && first !== last) {
      const a = geo.cumulative[geo.indexOf.get(last.to)!]!;
      let b = geo.cumulative[geo.indexOf.get(first.from)!]!;
      if (b < a) b += geo.total;
      const middle = ((a + b) / 2) % geo.total;
      ring = rotate(ring, nearestByDistance(geo.cumulative, 0, ring.length - 1, middle));
      geo = geometryOf(ring, nodes);
      start = "approximate";
    }
  }

  const positionOf = (nodeId: number) => geo.cumulative[geo.indexOf.get(nodeId)!]! / geo.total;
  const directionOf = (fromNode: number, toNode: number) => {
    const from = geo.indexOf.get(fromNode)!;
    const to = geo.indexOf.get(toNode)!;
    const seg = geo.meters.slice(Math.max(0, from - 1), Math.min(geo.meters.length, to + 2));
    return turning(seg) < 0 ? ("left" as const) : ("right" as const);
  };

  // Drop tags that break lap order (mis-tagged ways), keeping the longest consistent run.
  const ordered = tagged
    .map((c) => ({ ...c, position: positionOf(c.apex) }))
    .sort((x, y) => x.number - y.number);
  const keep = new Set(
    longestIncreasing(ordered.map((c) => c.position)).map((i) => ordered[i]!.number),
  );
  for (const c of ordered) {
    if (!keep.has(c.number))
      warnings.push(`T${c.number} is tagged out of lap order and was ignored`);
  }
  // A chosen start comes after the lap-order check, which needs the loop's own
  // start: from a start part-way round, T1… legitimately wraps past 0.
  if (options.startAt !== undefined && wrapFraction(options.startAt) > 0) {
    ({ ring, geo } = restartAt(ring, nodes, geo, wrapFraction(options.startAt) * geo.total));
    start = "chosen";
  }
  const corners: OsmCorner[] = ordered
    .filter((c) => keep.has(c.number))
    .map((c) => ({
      number: c.number,
      name: c.name,
      direction: directionOf(c.from, c.to),
      position: round(start === "chosen" ? positionOf(c.apex) : c.position, 4),
    }));

  const { meters } = geo;
  const outline = simplify(normalize([...meters, meters[0]!], SIZE), 0.5).slice(0, -1);
  const sections = namedSections(
    ways.filter((w) => best.cycle.wayIds.has(w.id)),
    geo,
    nameOf,
  );

  return {
    ok: true,
    outlinePath: toPathData(outline, true),
    loopLengthMeters: Math.round(best.cycle.length),
    loops: candidates.map((c) => ({
      lengthMeters: Math.round(c.cycle.length),
      taggedCorners: c.covered,
    })),
    loopIndex,
    start,
    direction,
    corners,
    warnings,
    sections,
    loop: { ring, wayIds: best.cycle.wayIds, nodes, ways },
  };
}
