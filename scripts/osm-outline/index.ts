// Builds sample track files from OpenStreetMap data (© OpenStreetMap
// contributors, ODbL). Usage: pnpm osm-outline [trackId...]
//
// Fetches highway=raceway ways via Overpass (cached in .cache/), finds the
// circuit loop matching the official lap length, starts it at the OSM
// finish/start line node, orients it in the driving direction, and writes
// examples/<id>.track.json with a normalized outline and corner positions.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TrackImportPayload } from "../../packages/schema/src/index";
import {
  cumulativeLengths,
  findCycles,
  normalize,
  project,
  signedAreaScreen,
  simplify,
  toPathData,
  turning,
  type OsmElement,
  type OsmNode,
  type OsmWay,
} from "./lib";
import { TRACKS, type TrackConfig } from "./tracks";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const OVERPASS = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "track-day-osm-outline/0.1 (https://github.com/LuisTeles/track-day)";
const SIZE = 1000;

async function fetchOsm(config: TrackConfig): Promise<OsmElement[]> {
  const cacheFile = join(here, ".cache", `${config.id}.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8")).elements;

  const [s, w, n, e] = config.bbox;
  const query = `[out:json][timeout:90];way["highway"="raceway"](${s},${w},${n},${e});out body;>;out body qt;`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) {
      const text = await res.text();
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, text);
      return JSON.parse(text).elements;
    }
    const wait = 10_000 * attempt;
    console.warn(`  Overpass ${res.status}, retrying in ${wait / 1000}s…`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error("Overpass unavailable");
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

async function build(config: TrackConfig) {
  console.log(`\n${config.id}`);
  const elements = await fetchOsm(config);
  const nodes = new Map<number, OsmNode>();
  for (const el of elements) if (el.type === "node") nodes.set(el.id, el);
  const ways = elements.filter(
    (el): el is OsmWay => el.type === "way" && el.tags.highway === "raceway" && !isExcluded(el),
  );

  const nameOf = (tags: Record<string, string>) => {
    const raw = (config.nameTag && tags[config.nameTag]) || tags.name;
    return raw ? (config.nameOverrides?.[raw] ?? raw) : undefined;
  };

  const startNode = ["Finish Line", "Start Line"]
    .map((name) => [...nodes.values()].find((n) => n.tags?.name === name))
    .find((n) => n && ways.some((w) => w.nodes.includes(n.id)));
  console.log(
    `  start: ${startNode ? `"${startNode.tags!.name}" node` : "none tagged (arbitrary)"}`,
  );

  const target = config.layout.lengthMeters;
  const cycles = findCycles(ways, nodes, { maxLength: target * 1.1, mustInclude: startNode?.id });
  const cornerWays = ways.filter((w) => w.tags["raceway:corner_number"]);
  const candidates = cycles
    .filter((c) => Math.abs(c.length - target) / target < 0.05)
    .map((c) => ({
      cycle: c,
      covered: cornerWays.filter((w) => c.wayIds.has(w.id)).length,
      error: Math.abs(c.length - target) / target,
    }))
    .sort((a, b) => b.covered - a.covered || a.error - b.error);
  const best = candidates[0];
  if (!best) {
    const lengths = cycles.map((c) => Math.round(c.length)).sort((a, b) => a - b);
    throw new Error(
      `No loop within 5% of ${target} m. Loops found: ${lengths.join(", ") || "none"}`,
    );
  }
  console.log(
    `  loop: ${Math.round(best.cycle.length)} m vs ${target} m official (${(best.error * 100).toFixed(1)}%), ` +
      `${best.covered}/${cornerWays.length} tagged corner ways, ${cycles.length} loops considered`,
  );
  if (best.error > 0.02) console.warn("  ⚠ more than 2% off the official length");

  // Orient: start at the line, run in the driving direction.
  let ring = best.cycle.nodes;
  if (startNode) ring = rotate(ring, ring.indexOf(startNode.id));
  // Orient by OSM oneway tags when present: they encode the driving direction
  // directly, and work for figure-eights where the enclosed area doesn't.
  const votes = onewayVotes(ring, ways);
  if (votes.agree + votes.disagree > 0) {
    if (votes.disagree > votes.agree) ring = [ring[0]!, ...ring.slice(1).reverse()];
    const n = votes.agree + votes.disagree;
    console.log(
      `  direction: from OSM oneway tags (${Math.max(votes.agree, votes.disagree)} of ${n} edges)`,
    );
  } else {
    const clockwise = signedAreaScreen(project(ring.map((id) => nodes.get(id)!))) > 0;
    if (clockwise !== (config.layout.direction === "clockwise")) {
      ring = [ring[0]!, ...ring.slice(1).reverse()];
    }
    console.log("  direction: from the configured layout direction (no oneway tags)");
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
  for (const [number, cornerWaysForNumber] of byNumber) {
    const idx = cornerWaysForNumber
      .flatMap((w) => w.nodes)
      .map((id) => geo.indexOf.get(id))
      .filter((i): i is number => i !== undefined)
      .sort((x, y) => x - y);
    if (idx.length < 2) {
      console.warn(`  ⚠ T${number} is not on the loop, skipped`);
      continue;
    }
    const from = idx[0]!;
    const to = idx[idx.length - 1]!;
    const rawName = cornerWaysForNumber.map((w) => nameOf(w.tags)).find(Boolean) ?? null;
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
      name: rawName,
      from: ring[from]!,
      to: ring[to]!,
    });
  }

  // Without a tagged line, start halfway between the last corner and T1.
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
      const target = ((a + b) / 2) % geo.total;
      ring = rotate(ring, nearestByDistance(geo.cumulative, 0, ring.length - 1, target));
      geo = geometryOf(ring, nodes);
      console.log(`  start: placed halfway between T${last.number} and T1 (approximate)`);
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
    if (!keep.has(c.number)) console.warn(`  ⚠ T${c.number}: OSM tag is out of lap order, ignored`);
  }

  const corners: TrackImportPayload["corners"] = ordered
    .filter((c) => keep.has(c.number))
    .map((c) => ({
      number: c.number,
      name: c.name,
      direction: directionOf(c.from, c.to),
      pathPosition: round(c.position, 4),
    }));

  // Fill gaps in the numbering: the sharpest point between the neighbours.
  const maxNumber = Math.max(...corners.map((c) => c.number));
  for (let n = 2; n < maxNumber; n++) {
    if (corners.some((c) => c.number === n)) continue;
    const prev = corners.filter((c) => c.number < n).at(-1);
    const next = corners.find((c) => c.number > n);
    if (!prev || !next) continue;
    const inferred = sharpestBetween(geo, prev.pathPosition!, next.pathPosition!);
    if (!inferred) continue;
    corners.push({
      number: n,
      name: null,
      direction: inferred.direction,
      pathPosition: round(inferred.position, 4),
      notes: "Position inferred from the track geometry (not tagged in OpenStreetMap).",
    });
    console.warn(`  ⚠ T${n}: not tagged, position inferred from curvature`);
  }

  for (const c of corners) {
    c.distanceFromStartMeters = Math.round(c.pathPosition! * config.layout.lengthMeters);
    Object.assign(c, config.details?.[c.number]);
  }
  corners.sort((x, y) => x.pathPosition! - y.pathPosition!);
  console.log(
    `  corners: ${corners.map((c) => `T${c.number}${c.direction === "left" ? "L" : "R"}`).join(" ")}`,
  );
  const { meters, total } = geo;

  // Complexes: consecutive corners sharing a name (e.g. both halves of an S).
  const complexes: NonNullable<TrackImportPayload["complexes"]> = [];
  for (let i = 0; i < corners.length;) {
    let j = i;
    while (
      j + 1 < corners.length &&
      corners[j + 1]!.name &&
      corners[j + 1]!.name === corners[i]!.name
    )
      j++;
    if (j > i) {
      complexes.push({
        name: corners[i]!.name!,
        cornerNumbers: corners.slice(i, j + 1).map((c) => c.number),
      });
    }
    i = j + 1;
  }

  // Segments: named ways on the loop that aren't corners (straights).
  const cornerNames = new Set(corners.map((c) => c.name));
  const segments: NonNullable<TrackImportPayload["segments"]> = [];
  for (const way of ways) {
    const name = nameOf(way.tags);
    if (
      !name ||
      way.tags["raceway:corner_number"] ||
      cornerNames.has(name) ||
      !best.cycle.wayIds.has(way.id)
    )
      continue;
    if (segments.some((s) => s.name === name)) continue;
    const idx = way.nodes
      .map((id) => geo.indexOf.get(id))
      .filter((i): i is number => i !== undefined);
    const position = geo.cumulative[idx[Math.floor(idx.length / 2)]!]! / total;
    const before =
      [...corners].reverse().find((c) => c.pathPosition! < position) ?? corners[corners.length - 1];
    const after = corners.find((c) => c.pathPosition! > position) ?? corners[0];
    segments.push({ name, fromCorner: before?.number, toCorner: after?.number });
  }

  const outline = simplify(normalize([...meters, meters[0]!], SIZE), 0.5).slice(0, -1);

  const payload = TrackImportPayload.parse({
    schemaVersion: 1,
    kind: "track",
    track: config.track,
    layout: { ...config.layout, outlinePath: toPathData(outline, true) },
    corners,
    complexes,
    segments,
  });

  const out = join(root, "examples", `${config.id}.track.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log(`  wrote ${out} (${outline.length} outline points)`);
}

/** Counts oneway way edges that run with (agree) or against (disagree) the ring order. */
function onewayVotes(ring: number[], ways: OsmWay[]) {
  const order = new Map(ring.map((id, i) => [id, i]));
  let agree = 0;
  let disagree = 0;
  for (const way of ways.filter((w) => w.tags.oneway === "yes")) {
    for (let i = 1; i < way.nodes.length; i++) {
      const a = order.get(way.nodes[i - 1]!);
      const b = order.get(way.nodes[i]!);
      if (a === undefined || b === undefined) continue;
      if (b === a + 1 || (a === ring.length - 1 && b === 0)) agree++;
      else if (a === b + 1 || (b === ring.length - 1 && a === 0)) disagree++;
    }
  }
  return { agree, disagree };
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

const rotate = <T>(items: T[], start: number) => [...items.slice(start), ...items.slice(0, start)];

function geometryOf(ring: number[], nodes: Map<number, OsmNode>) {
  const meters = project(ring.map((id) => nodes.get(id)!));
  const cumulative = cumulativeLengths(meters, true);
  return {
    meters,
    cumulative,
    total: cumulative[cumulative.length - 1]!,
    indexOf: new Map(ring.map((id, i) => [id, i])),
  };
}

/** Index in [from, to] whose cumulative distance is closest to `target`. */
function nearestByDistance(cumulative: number[], from: number, to: number, target: number) {
  let best = from;
  for (let i = from; i <= to; i++) {
    if (Math.abs(cumulative[i]! - target) < Math.abs(cumulative[best]! - target)) best = i;
  }
  return best;
}

/** Indices of the longest strictly increasing subsequence (O(n²), n is small). */
function longestIncreasing(values: number[]): number[] {
  const len = values.map(() => 1);
  const prev = values.map(() => -1);
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j]! < values[i]! && len[j]! + 1 > len[i]!) {
        len[i] = len[j]! + 1;
        prev[i] = j;
      }
    }
  }
  let i = len.indexOf(Math.max(...len));
  const out: number[] = [];
  while (i !== -1) {
    out.unshift(i);
    i = prev[i]!;
  }
  return out;
}

/**
 * The point of sharpest curvature strictly between two lap fractions, keeping
 * 40 m clear of each neighbour. Curvature is measured over a ±25 m window.
 */
function sharpestBetween(geo: ReturnType<typeof geometryOf>, from: number, to: number) {
  const { meters, cumulative, total } = geo;
  const at = (d: number) => {
    const target = ((d % total) + total) % total;
    return meters[nearestByDistance(cumulative, 0, meters.length - 1, target)]!;
  };
  let best: { position: number; turn: number } | undefined;
  for (let d = from * total + 40; d < to * total - 40; d += 5) {
    const turn = turning([at(d - 25), at(d), at(d + 25)]);
    if (!best || Math.abs(turn) > Math.abs(best.turn)) best = { position: d / total, turn };
  }
  return (
    best && {
      position: best.position,
      direction: best.turn < 0 ? ("left" as const) : ("right" as const),
    }
  );
}

const only = process.argv.slice(2);
for (const config of TRACKS.filter((t) => only.length === 0 || only.includes(t.id))) {
  try {
    await build(config);
  } catch (e) {
    console.error(`  ✗ ${config.id}: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}
