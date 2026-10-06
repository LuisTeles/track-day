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
import {
  buildTrackGeometry,
  extent,
  geometryOf,
  illustrativeRacingLine,
  normalize,
  round,
  sharpestBetween,
  simplify,
  toPathData,
  type OsmElement,
} from "../../packages/osm-track/src/index";
import { TrackImportPayload } from "../../packages/schema/src/index";
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

async function build(config: TrackConfig) {
  console.log(`\n${config.id}`);
  const elements = await fetchOsm(config);

  const nameOf = (tags: Record<string, string>) => {
    const raw = (config.nameTag && tags[config.nameTag]) || tags.name;
    return raw ? (config.nameOverrides?.[raw] ?? raw) : undefined;
  };

  const result = buildTrackGeometry(elements, {
    lengthMeters: config.layout.lengthMeters,
    direction: config.layout.direction,
    nameOf,
  });
  if (!result.ok) {
    throw new Error(
      result.reason === "no-raceway"
        ? "No raceway ways in the bounding box"
        : `No loop within 15% of ${config.layout.lengthMeters} m. Loops found: ${result.loopsFound.join(", ") || "none"}`,
    );
  }
  console.log(
    `  loop: ${result.loopLengthMeters} m vs ${config.layout.lengthMeters} m official; ` +
      `start ${result.start}; direction from ${result.direction}; ${result.corners.length} tagged corners`,
  );
  for (const w of result.warnings) console.warn(`  ⚠ ${w}`);

  const geo = geometryOf(result.loop.ring, result.loop.nodes);
  const corners: TrackImportPayload["corners"] = result.corners.map((c) => ({
    number: c.number,
    name: c.name,
    direction: c.direction,
    pathPosition: c.position,
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
  for (const way of result.loop.ways) {
    const name = nameOf(way.tags);
    if (
      !name ||
      way.tags["raceway:corner_number"] ||
      cornerNames.has(name) ||
      !result.loop.wayIds.has(way.id)
    )
      continue;
    if (segments.some((s) => s.name === name)) continue;
    const idx = way.nodes
      .map((id) => geo.indexOf.get(id))
      .filter((i): i is number => i !== undefined);
    const position = geo.cumulative[idx[Math.floor(idx.length / 2)]!]! / geo.total;
    const before =
      [...corners].reverse().find((c) => c.pathPosition! < position) ?? corners[corners.length - 1];
    const after = corners.find((c) => c.pathPosition! > position) ?? corners[0];
    segments.push({ name, fromCorner: before?.number, toCorner: after?.number });
  }

  // Same normalization as the outline, so both share one coordinate space.
  const { meters } = geo;
  const normalized = normalize([...meters, meters[0]!], SIZE);
  const unitsPerMeter = SIZE / Math.max(...extent(meters));
  const racingLine = config.illustrativeRacingLine
    ? simplify(
        illustrativeRacingLine(
          normalized.slice(0, -1),
          2 * unitsPerMeter,
          35 * unitsPerMeter,
          5 * unitsPerMeter,
        ),
        0.3,
      )
    : null;

  const payload = TrackImportPayload.parse({
    schemaVersion: 1,
    kind: "track",
    track: config.track,
    layout: {
      ...config.layout,
      outlinePath: result.outlinePath,
      outlineSource: "osm",
      ...(racingLine && { racingLinePath: toPathData(racingLine, true) }),
    },
    corners,
    complexes,
    segments,
  });

  const out = join(root, "examples", `${config.id}.track.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log(`  wrote ${out}`);
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
