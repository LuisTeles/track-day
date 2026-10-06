# OpenStreetMap Map Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a layout without an outline, **Add map from OpenStreetMap** searches the circuit, previews the OSM outline with the layout's corners on it, and saves the outline plus OSM-tagged corner positions.

**Architecture:** The geometry logic in `scripts/osm-outline` moves into a pure, tested package `@track-day/osm-track` that both the CLI and the web app use. The web app calls Nominatim and Overpass from the browser (`osm-client.ts`), runs `buildTrackGeometry()` locally, previews the result, and saves through a new transactional `LayoutGeometryService`. A new optional `Layout.outlineSource` drives the ODbL attribution.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Next.js 16 static export, React 19, TanStack Query, Dexie, Zod 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-osm-map-import-design.md`

## Global Constraints

- No server, no API keys: OSM is called from the browser. Requests go out only on a button press; no search-as-you-type.
- Nominatim: `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=…`, 15 s timeout.
- Overpass: `https://overpass-api.de/api/interpreter`, POST `data=[out:json][timeout:60];way["highway"="raceway"](s,w,n,e);out body;>;out body qt;`, 60 s timeout.
- On HTTP 429 or 504, retry **once** after 5 s, then fail with kind `"busy"`.
- A bbox with a diagonal over **10 km** is rejected before querying Overpass (`"too-large"`).
- Candidate loops lie within **±15%** of the layout length. Loops within **5%** rank first, then by most tagged corners, then by smallest length error. The top **5** are offered.
- The "use OSM length" option appears when the loop differs from the layout length by more than **2%**, and is unchecked by default.
- Corners are never added or removed. OSM-tagged numbers that match a layout corner get `pathPosition`; the rest are untouched.
- `Layout.outlineSource` is optional (`"osm" | null`). There is no `schemaVersion` bump and no migration.
- Attribution text: "Map data © OpenStreetMap contributors", linked to `https://www.openstreetmap.org/copyright`, shown when `outlineSource === "osm"`.
- Script parity: regenerating `examples/interlagos.track.json` and `examples/suzuka.track.json` changes only the added `"outlineSource": "osm"`.
- Commits follow Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Changing the loop in the preview, then saving**: the saved outline and corner positions must come from the selected loop, not the first one. (Test in Task 8.)
2. **A layout with `lengthMeters: null`** (possible from backups or older data): the panel explains it can't match the circuit instead of crashing or querying OSM. (Test in Task 8.)
3. **Picking place A, then quickly place B**: A's slower response must not overwrite B's preview. (Test in Task 8.)
4. **Accented search text** ("Autódromo José Carlos Pace São Paulo") must be URL-encoded correctly. (Test in Task 5.)
5. **Overpass answering HTTP 200 with a `remark` like "runtime error: Query timed out" and no elements**: report it as "busy", not "no circuit mapped here". (Test in Task 5.)

---

## File structure

| File                                                                 | Responsibility                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/osm-track/package.json`, `tsconfig.json`                   | New workspace package                                                                          |
| `packages/osm-track/src/lib.ts`                                      | Moved from `scripts/osm-outline/lib.ts`, plus the helpers moved out of the script's `index.ts` |
| `packages/osm-track/src/build.ts`                                    | `buildTrackGeometry()`                                                                         |
| `packages/osm-track/src/index.ts`                                    | Re-exports                                                                                     |
| `packages/osm-track/test/fixtures/{interlagos,suzuka,monaco}.json`   | Cached Overpass responses (ODbL)                                                               |
| `scripts/osm-outline/index.ts`                                       | Thin CLI over the package                                                                      |
| `packages/schema/src/entities.ts`, `payloads.ts`                     | `outlineSource`                                                                                |
| `apps/web/src/data/local/layout-geometry.ts`                         | `LocalLayoutGeometryService`                                                                   |
| `apps/web/src/features/osm-map/osm-client.ts`                        | Nominatim + Overpass                                                                           |
| `apps/web/src/features/osm-map/match-corners.ts`                     | Layout corners × OSM corners → positions and labels                                            |
| `apps/web/src/features/osm-map/map-preview.tsx`                      | SVG preview                                                                                    |
| `apps/web/src/features/osm-map/add-map-panel.tsx`, `use-save-map.ts` | Panel and save                                                                                 |
| `apps/web/src/shared/ui/osm-attribution.tsx`                         | Attribution line                                                                               |
| `apps/web/src/features/track-view/no-outline.tsx`                    | Hosts the panel                                                                                |
| `apps/web/e2e/osm-map.spec.ts`                                       | E2E with routed OSM responses                                                                  |

---

### Task 1: `@track-day/osm-track` package

**Files:**

- Create: `packages/osm-track/package.json`, `packages/osm-track/tsconfig.json`, `packages/osm-track/src/index.ts`, `packages/osm-track/src/build.ts`, `packages/osm-track/test/fixtures/{interlagos,suzuka,monaco}.json`
- Move: `scripts/osm-outline/lib.ts` → `packages/osm-track/src/lib.ts` (then append helpers)
- Test: `packages/osm-track/src/build.test.ts`

**Interfaces:**

- Produces (from `@track-day/osm-track`):

  ```ts
  // lib.ts (existing, moved): OsmNode, OsmWay, OsmElement, Point, haversine, findCycles, Cycle, project,
  //   signedAreaScreen, cumulativeLengths, simplify, normalize, turning, toPathData, illustrativeRacingLine
  // lib.ts (moved from scripts/osm-outline/index.ts): onewayVotes, extent, round, rotate,
  //   geometryOf, LoopGeometry, nearestByDistance, longestIncreasing, sharpestBetween
  interface BuildOptions {
    lengthMeters: number;
    direction: "clockwise" | "anticlockwise";
    loopIndex?: number;
    nameOf?: (tags: Record<string, string>) => string | undefined;
  }
  interface OsmCorner {
    number: number;
    name: string | null;
    position: number;
    direction: "left" | "right";
  }
  interface LoopOption {
    lengthMeters: number;
    taggedCorners: number;
  }
  interface TrackGeometryResult {
    ok: true;
    outlinePath: string;
    loopLengthMeters: number;
    loops: LoopOption[];
    loopIndex: number;
    start: "tagged" | "approximate" | "arbitrary";
    direction: "oneway-tags" | "layout";
    corners: OsmCorner[];
    warnings: string[];
    loop: { ring: number[]; wayIds: Set<number>; nodes: Map<number, OsmNode>; ways: OsmWay[] };
  }
  interface TrackGeometryFailure {
    ok: false;
    reason: "no-raceway" | "no-loop";
    loopsFound: number[];
  }
  function buildTrackGeometry(
    elements: OsmElement[],
    options: BuildOptions,
  ): TrackGeometryResult | TrackGeometryFailure;
  ```

  `corners` are sorted by `number`, with `position` rounded to 4 digits. `loop` is for the CLI only.

- [ ] **Step 1: Scaffold the package and move the library**

```bash
mkdir -p packages/osm-track/src packages/osm-track/test/fixtures
git mv scripts/osm-outline/lib.ts packages/osm-track/src/lib.ts
cp scripts/osm-outline/.cache/{interlagos,suzuka,monaco}.json packages/osm-track/test/fixtures/
```

`packages/osm-track/package.json`:

```json
{
  "name": "@track-day/osm-track",
  "version": "0.0.0",
  "private": true,
  "description": "Turns OpenStreetMap raceway data into Track Day outlines.",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^26.6.4",
    "@vitest/coverage-v8": "^5.0.3",
    "vitest": "^5.0.3"
  }
}
```

`packages/osm-track/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": ["node"]
  },
  "include": ["src"]
}
```

`packages/osm-track/src/index.ts`:

```ts
export * from "./lib";
export * from "./build";
```

In `packages/osm-track/src/lib.ts`, change the header comment to:

```ts
// Pure helpers for turning OpenStreetMap raceway ways into a normalized track
// outline. No I/O; used by scripts/osm-outline and the web app.
```

and append these helpers, moved **verbatim** from `scripts/osm-outline/index.ts` but now exported:

```ts
// ---------------------------------------------------------------------------
// Loop helpers (moved from scripts/osm-outline/index.ts)
// ---------------------------------------------------------------------------

/** Counts oneway way edges that run with (agree) or against (disagree) the ring order. */
export function onewayVotes(ring: number[], ways: OsmWay[]) {
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

export const extent = (points: { x: number; y: number }[]) => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

export const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export const rotate = <T>(items: T[], start: number) => [
  ...items.slice(start),
  ...items.slice(0, start),
];

export function geometryOf(ring: number[], nodes: Map<number, OsmNode>) {
  const meters = project(ring.map((id) => nodes.get(id)!));
  const cumulative = cumulativeLengths(meters, true);
  return {
    meters,
    cumulative,
    total: cumulative[cumulative.length - 1]!,
    indexOf: new Map(ring.map((id, i) => [id, i])),
  };
}
export type LoopGeometry = ReturnType<typeof geometryOf>;

/** Index in [from, to] whose cumulative distance is closest to `target`. */
export function nearestByDistance(cumulative: number[], from: number, to: number, target: number) {
  let best = from;
  for (let i = from; i <= to; i++) {
    if (Math.abs(cumulative[i]! - target) < Math.abs(cumulative[best]! - target)) best = i;
  }
  return best;
}

/** Indices of the longest strictly increasing subsequence (O(n²), n is small). */
export function longestIncreasing(values: number[]): number[] {
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
export function sharpestBetween(geo: LoopGeometry, from: number, to: number) {
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
```

Then run `pnpm install` so the workspace links the package.

- [ ] **Step 2: Write the failing tests**

`packages/osm-track/src/build.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTrackGeometry, type OsmElement, type TrackGeometryResult } from "./index";

const fixture = (name: string): OsmElement[] =>
  JSON.parse(readFileSync(new URL(`../test/fixtures/${name}.json`, import.meta.url), "utf8"))
    .elements;
const example = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../examples/${name}.track.json`, import.meta.url), "utf8"),
  ) as {
    layout: { outlinePath: string };
    corners: { number: number; pathPosition: number; notes?: string }[];
  };

function ok(result: ReturnType<typeof buildTrackGeometry>): TrackGeometryResult {
  if (!result.ok) throw new Error(`expected a loop, got ${result.reason}`);
  return result;
}

describe("buildTrackGeometry", () => {
  it("builds Interlagos from the tagged start line, in lap order", () => {
    const r = ok(
      buildTrackGeometry(fixture("interlagos"), { lengthMeters: 4309, direction: "anticlockwise" }),
    );
    expect(Math.abs(r.loopLengthMeters - 4309) / 4309).toBeLessThan(0.02);
    expect(r.start).toBe("tagged");
    expect(r.direction).toBe("oneway-tags");
    expect(r.corners.map((c) => c.number)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    const positions = r.corners.map((c) => c.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(r.outlinePath).toMatch(/^M\S+ \S+ L/);
    expect(r.outlinePath.endsWith(" Z")).toBe(true);
  });

  it.each(["interlagos", "suzuka"] as const)(
    "matches today's %s example (script parity)",
    (name) => {
      const ex = example(name);
      const config =
        name === "interlagos"
          ? { lengthMeters: 4309, direction: "anticlockwise" as const }
          : { lengthMeters: 5807, direction: "clockwise" as const };
      const r = ok(buildTrackGeometry(fixture(name), config));
      expect(r.outlinePath).toBe(ex.layout.outlinePath);
      const tagged = ex.corners.filter((c) => !c.notes);
      for (const c of tagged) {
        expect(r.corners.find((o) => o.number === c.number)?.position).toBe(c.pathPosition);
      }
    },
  );

  it("places Suzuka's start approximately (no start/finish node in OSM)", () => {
    const r = ok(
      buildTrackGeometry(fixture("suzuka"), { lengthMeters: 5807, direction: "clockwise" }),
    );
    expect(r.start).toBe("approximate");
  });

  it("lists alternative loops and selects one by index", () => {
    const options = { lengthMeters: 4309, direction: "anticlockwise" as const };
    const first = ok(buildTrackGeometry(fixture("interlagos"), options));
    expect(first.loops.length).toBeGreaterThan(1);
    expect(first.loops.length).toBeLessThanOrEqual(5);
    expect(first.loopIndex).toBe(0);

    const second = ok(buildTrackGeometry(fixture("interlagos"), { ...options, loopIndex: 1 }));
    expect(second.loopIndex).toBe(1);
    expect(second.loopLengthMeters).toBe(first.loops[1]!.lengthMeters);
    expect(second.outlinePath).not.toBe(first.outlinePath);
  });

  it("still finds Interlagos when the lap length is 10% off, with a warning", () => {
    const r = ok(
      buildTrackGeometry(fixture("interlagos"), { lengthMeters: 3900, direction: "anticlockwise" }),
    );
    // A near-duplicate loop (~4.2–4.4 km) may rank first; any of them is the circuit.
    expect(r.loopLengthMeters).toBeGreaterThan(4150);
    expect(r.loopLengthMeters).toBeLessThan(4450);
    expect(r.warnings.join(" ")).toMatch(/longer than the layout length/);
  });

  it("reports no loop for Monaco, a street circuit mapped as ordinary roads", () => {
    const r = buildTrackGeometry(fixture("monaco"), { lengthMeters: 3337, direction: "clockwise" });
    expect(r).toMatchObject({ ok: false, reason: "no-loop" });
    if (!r.ok) expect(r.loopsFound.length).toBeGreaterThan(0);
  });

  it("reports no raceway when there are no raceway ways", () => {
    expect(buildTrackGeometry([], { lengthMeters: 4309, direction: "clockwise" })).toEqual({
      ok: false,
      reason: "no-raceway",
      loopsFound: [],
    });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @track-day/osm-track exec vitest run`
Expected: FAIL ("Failed to resolve import ./build" or `buildTrackGeometry` not exported).

- [ ] **Step 4: Implement `build.ts`**

This is the script's `build()` logic, from loading the elements up to the outline. The only behavior changes are the ±15% candidates (with 5% loops ranked first, so the choice is unchanged) and `loopIndex`.

```ts
import {
  findCycles,
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

export interface BuildOptions {
  lengthMeters: number;
  direction: "clockwise" | "anticlockwise";
  /** Which of `loops` to build (default 0, the best match). */
  loopIndex?: number;
  /** Corner names from way tags; defaults to `name`. */
  nameOf?: (tags: Record<string, string>) => string | undefined;
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
  start: "tagged" | "approximate" | "arbitrary";
  direction: "oneway-tags" | "layout";
  /** OSM-tagged corners on the loop, by number. */
  corners: OsmCorner[];
  warnings: string[];
  /** Raw loop data for the CLI (segments, inferred corners, racing line). */
  loop: { ring: number[]; wayIds: Set<number>; nodes: Map<number, OsmNode>; ways: OsmWay[] };
}

export interface TrackGeometryFailure {
  ok: false;
  reason: "no-raceway" | "no-loop";
  /** Lengths (m) of the loops that were found, sorted. */
  loopsFound: number[];
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
  const cycles = findCycles(ways, nodes, {
    maxLength: target * (1 + LOOSE),
    mustInclude: startNode?.id,
  });
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
  const corners: OsmCorner[] = ordered
    .filter((c) => keep.has(c.number))
    .map((c) => ({
      number: c.number,
      name: c.name,
      direction: directionOf(c.from, c.to),
      position: round(c.position, 4),
    }));

  const { meters } = geo;
  const outline = simplify(normalize([...meters, meters[0]!], SIZE), 0.5).slice(0, -1);

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
    loop: { ring, wayIds: best.cycle.wayIds, nodes, ways },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @track-day/osm-track exec vitest run && pnpm --filter @track-day/osm-track typecheck && pnpm --filter @track-day/osm-track lint`
Expected: PASS. If parity fails, diff the first differing coordinate against the old script. The cause must be a transcription slip in `build.ts`. Don't change the expected values.

- [ ] **Step 6: Commit**

`scripts/osm-outline/index.ts` still imports `./lib`, so it's broken until Task 3. Typecheck the scripts only after Task 3.

```bash
git add packages/osm-track pnpm-lock.yaml scripts/osm-outline/lib.ts
git commit -m "feat(osm-track): extract the OpenStreetMap outline builder into a package

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `Layout.outlineSource`

**Files:**

- Modify: `packages/schema/src/entities.ts` (Layout), `packages/schema/src/payloads.ts` (TrackImportPayload.layout), `apps/web/src/data/local/import-services.ts` (layout create), `packages/prompts/src/track.ts` (omit list), `docs/data-model.md` (Layout row)
- Test: `packages/schema/src/payloads.test.ts`, `apps/web/src/data/local/import-services.test.ts`

**Interfaces:**

- Produces: `OutlineSource = z.enum(["osm"])`; `Layout.outlineSource?: "osm" | null`; `TrackImportPayload.layout.outlineSource?: "osm" | null`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/schema/src/payloads.test.ts`, inside or after the track payload `describe` (use the imports the file already has; add `Layout` to the `./entities` import if missing):

```ts
describe("outlineSource", () => {
  it("accepts a track payload layout with outlineSource osm", () => {
    const parsed = TrackImportPayload.parse({
      schemaVersion: 1,
      kind: "track",
      track: { name: "Test" },
      layout: { name: "GP", lengthMeters: 1000, direction: "clockwise", outlineSource: "osm" },
      corners: [{ number: 1, direction: "left" }],
    });
    expect(parsed.layout.outlineSource).toBe("osm");
  });

  it("rejects an unknown outline source", () => {
    expect(() =>
      TrackImportPayload.parse({
        schemaVersion: 1,
        kind: "track",
        track: { name: "Test" },
        layout: { name: "GP", lengthMeters: 1000, direction: "clockwise", outlineSource: "ai" },
        corners: [{ number: 1, direction: "left" }],
      }),
    ).toThrow();
  });
});
```

Append to `apps/web/src/data/local/import-services.test.ts` inside `describe("importTrack", …)`, and add `Layout` to its `@track-day/schema` import:

```ts
it("stores the outline source, and defaults it to null", async () => {
  const withSource = await repos.trackImport.importTrack({
    ...interlagos,
    layout: { ...interlagos.layout, outlineSource: "osm" },
  });
  expect(await repos.layouts.get(withSource.layoutId)).toMatchObject({ outlineSource: "osm" });

  const without = await repos.trackImport.importTrack({
    ...interlagos,
    layout: { ...interlagos.layout, outlineSource: undefined },
  });
  expect((await repos.layouts.get(without.layoutId))?.outlineSource).toBeNull();
});

it("still reads a stored layout written before outlineSource existed", async () => {
  const { layoutId } = await repos.trackImport.importTrack(interlagos);
  const legacy: Partial<Layout> = { ...(await db.layouts.get(layoutId))! };
  delete legacy.outlineSource;
  await db.layouts.put(legacy as Layout);
  await expect(repos.layouts.update(layoutId, { name: "GP 2" })).resolves.toMatchObject({
    name: "GP 2",
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @track-day/schema exec vitest run src/payloads.test.ts; pnpm --filter web exec vitest run src/data/local/import-services.test.ts`
Expected: FAIL (`outlineSource` is stripped, so it's `undefined` rather than `"osm"` or `null`).

- [ ] **Step 3: Implement**

In `packages/schema/src/entities.ts`, before `export const Layout`:

```ts
/** Where a layout's outline came from; drives attribution (OSM data is ODbL). */
export const OutlineSource = z.enum(["osm"]);
export type OutlineSource = z.infer<typeof OutlineSource>;
```

and in `Layout`, after `outlinePath`:

```ts
  /** Optional so layouts stored before it existed still parse; no migration needed. */
  outlineSource: OutlineSource.nullable().optional(),
```

In `packages/schema/src/payloads.ts`, in `layout: z.object({…})` after `outlinePath: opt(SvgPath),`:

```ts
      outlineSource: opt(OutlineSource),
```

and add `OutlineSource` to the existing import from `./entities` (or wherever `SvgPath` is imported from in that file).

In `apps/web/src/data/local/import-services.ts`, in `repos.layouts.create({…})` after `outlinePath: …`:

```ts
          outlineSource: payload.layout.outlineSource ?? null,
```

In `packages/prompts/src/track.ts`, change `- Omit layout.outlinePath, layout.racingLinePath, layout.rotation, and each corner's pathPosition and labelOffset.` to `- Omit layout.outlinePath, layout.outlineSource, layout.racingLinePath, layout.rotation, and each corner's pathPosition and labelOffset.`

In `docs/data-model.md`, in the **Layout** row, after `` `outlinePath` (SVG path), `` insert `` `outlineSource` (`"osm"` or null; drives the OpenStreetMap attribution), ``.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -r exec vitest run && pnpm typecheck`
Expected: PASS. `pnpm typecheck` also covers `scripts/`, which is still broken from Task 1. If its only errors are in `scripts/osm-outline/index.ts`, that's expected until Task 3. Run `pnpm -r typecheck` to confirm the packages and the app are clean.

- [ ] **Step 5: Commit**

```bash
git add packages/schema packages/prompts apps/web/src/data/local docs/data-model.md
git commit -m "feat(schema): record where a layout outline came from

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: CLI on the package, examples regenerated

**Files:**

- Modify: `scripts/osm-outline/index.ts`, `examples/interlagos.track.json`, `examples/suzuka.track.json`, `examples/ATTRIBUTION.md`

**Interfaces:**

- Consumes: Task 1 exports; Task 2 `outlineSource` in `TrackImportPayload`.

- [ ] **Step 1: Rewrite `build()` on the package**

Replace the import block, the `isExcluded` function, the whole `build()` function and every helper below it (`onewayVotes` through `sharpestBetween`) in `scripts/osm-outline/index.ts`. Keep the header comment, the constants, `fetchOsm` and the final `for … of TRACKS` loop. New imports:

```ts
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
```

New `build()`:

```ts
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
```

`OsmElement` is still used by `fetchOsm`'s return type. Remove imports that become unused, so lint passes.

- [ ] **Step 2: Regenerate and check parity**

Run: `pnpm osm-outline interlagos suzuka && pnpm exec prettier --write examples && git diff --stat examples && git diff examples | grep '^[-+] ' | sort | uniq -c`
Expected: both files change by exactly one added line, `+      "outlineSource": "osm",`, and nothing else. Any other changed line is a parity bug. Fix `build.ts` or the script, not the examples.

- [ ] **Step 3: Attribution note**

In `examples/ATTRIBUTION.md`, after the "To regenerate" line, add:

```markdown
The raw OpenStreetMap responses in `packages/osm-track/test/fixtures/` (Interlagos, Suzuka, Monaco) are test fixtures under the same ODbL terms. Map data © OpenStreetMap contributors.
```

- [ ] **Step 4: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm -r exec vitest run`
Expected: all PASS (scripts typecheck again).

- [ ] **Step 5: Commit**

```bash
git add scripts/osm-outline/index.ts examples
git commit -m "refactor(scripts): build sample outlines with @track-day/osm-track

The examples now record outlineSource: osm; their geometry is unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `LayoutGeometryService`

**Files:**

- Create: `apps/web/src/data/local/layout-geometry.ts`
- Modify: `apps/web/src/data/repositories.ts`, `apps/web/src/data/local/local-repositories.ts`, `apps/web/src/data/local/import-services.ts` (the `EntityRepositories` Omit)
- Test: `apps/web/src/data/local/layout-geometry.test.ts`

**Interfaces:**

- Produces:

  ```ts
  interface SaveOutlineInput {
    layoutId: string;
    outlinePath: string;
    outlineSource: "osm";
    cornerPositions: { cornerId: string; pathPosition: number }[];
    lengthMeters?: number;
  }
  interface LayoutGeometryService {
    saveOutline(input: SaveOutlineInput): Promise<void>;
  }
  // Repositories.layoutGeometry: LayoutGeometryService
  ```

- [ ] **Step 1: Write the failing test**

`apps/web/src/data/local/layout-geometry.test.ts`:

```ts
// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { TrackImportPayload } from "@track-day/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Repositories } from "../repositories";
import { TrackDayDb } from "./db";
import { createLocalRepositories } from "./local-repositories";

const sample = TrackImportPayload.parse(
  JSON.parse(
    readFileSync(new URL("../../../../../examples/interlagos.track.json", import.meta.url), "utf8"),
  ),
);
// As an AI import arrives: no geometry.
const imported: TrackImportPayload = {
  ...sample,
  layout: { name: "GP", lengthMeters: 4309, direction: "anticlockwise" },
  corners: sample.corners.map((c) => ({ ...c, pathPosition: null, labelOffset: null })),
};

let db: TrackDayDb;
let repos: Repositories;

beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

describe("saveOutline", () => {
  it("writes the outline, its source and matched corner positions only", async () => {
    const { layoutId } = await repos.trackImport.importTrack(imported);
    const [t1, t2] = await repos.corners.listByLayout(layoutId);

    await repos.layoutGeometry.saveOutline({
      layoutId,
      outlinePath: "M0 0 L10 0 L10 10 Z",
      outlineSource: "osm",
      cornerPositions: [{ cornerId: t1!.id, pathPosition: 0.1 }],
    });

    expect(await repos.layouts.get(layoutId)).toMatchObject({
      outlinePath: "M0 0 L10 0 L10 10 Z",
      outlineSource: "osm",
      lengthMeters: 4309,
    });
    expect((await repos.corners.get(t1!.id))?.pathPosition).toBe(0.1);
    expect((await repos.corners.get(t2!.id))?.pathPosition).toBeNull();
  });

  it("updates the lap length when given", async () => {
    const { layoutId } = await repos.trackImport.importTrack(imported);
    await repos.layoutGeometry.saveOutline({
      layoutId,
      outlinePath: "M0 0 L10 0 L10 10 Z",
      outlineSource: "osm",
      cornerPositions: [],
      lengthMeters: 4312,
    });
    expect((await repos.layouts.get(layoutId))?.lengthMeters).toBe(4312);
  });

  it("refuses to overwrite an existing outline", async () => {
    const { layoutId } = await repos.trackImport.importTrack(sample);
    await expect(
      repos.layoutGeometry.saveOutline({
        layoutId,
        outlinePath: "M0 0 L1 0 Z",
        outlineSource: "osm",
        cornerPositions: [],
      }),
    ).rejects.toThrow("This layout already has a map.");
  });

  it("rolls back everything when a corner is not on the layout", async () => {
    const { layoutId } = await repos.trackImport.importTrack(imported);
    const other = await repos.trackImport.importTrack(imported);
    const [foreign] = await repos.corners.listByLayout(other.layoutId);

    await expect(
      repos.layoutGeometry.saveOutline({
        layoutId,
        outlinePath: "M0 0 L10 0 L10 10 Z",
        outlineSource: "osm",
        cornerPositions: [{ cornerId: foreign!.id, pathPosition: 0.5 }],
      }),
    ).rejects.toThrow(/not on this layout/);
    expect((await repos.layouts.get(layoutId))?.outlinePath).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/data/local/layout-geometry.test.ts`
Expected: FAIL (`Cannot read properties of undefined (reading 'saveOutline')`).

- [ ] **Step 3: Implement**

In `apps/web/src/data/repositories.ts`, before `export interface Repositories`:

```ts
export interface SaveOutlineInput {
  layoutId: string;
  outlinePath: string;
  outlineSource: "osm";
  /** Corners that get an exact position; others keep theirs (usually null). */
  cornerPositions: { cornerId: string; pathPosition: number }[];
  /** Only when the user chose the outline source's lap length. */
  lengthMeters?: number;
}

export interface LayoutGeometryService {
  /** Adds an outline to a layout without one, with corner positions, in one transaction. */
  saveOutline(input: SaveOutlineInput): Promise<void>;
}
```

and add `layoutGeometry: LayoutGeometryService;` to `Repositories`.

`apps/web/src/data/local/layout-geometry.ts`:

```ts
import type { LayoutGeometryService, Repositories, SaveOutlineInput } from "../repositories";
import type { TrackDayDb } from "./db";

export class LocalLayoutGeometryService implements LayoutGeometryService {
  constructor(
    private readonly db: TrackDayDb,
    private readonly repos: Pick<Repositories, "layouts" | "corners">,
  ) {}

  saveOutline(input: SaveOutlineInput) {
    const { db, repos } = this;
    // Repository writes join this transaction, so a failure rolls back everything.
    return db.transaction("rw", [db.layouts, db.corners], async () => {
      const layout = await db.layouts.get(input.layoutId);
      if (!layout || layout.deletedAt) throw new Error(`layouts/${input.layoutId} not found`);
      if (layout.outlinePath) throw new Error("This layout already has a map.");

      await repos.layouts.update(input.layoutId, {
        outlinePath: input.outlinePath,
        outlineSource: input.outlineSource,
        ...(input.lengthMeters !== undefined && { lengthMeters: input.lengthMeters }),
      });
      for (const { cornerId, pathPosition } of input.cornerPositions) {
        const corner = await db.corners.get(cornerId);
        if (!corner || corner.layoutId !== input.layoutId) {
          throw new Error(`Corner ${cornerId} is not on this layout`);
        }
        await repos.corners.update(cornerId, { pathPosition });
      }
    });
  }
}
```

In `local-repositories.ts`, import it (`import { LocalLayoutGeometryService } from "./layout-geometry";`) and add `layoutGeometry: new LocalLayoutGeometryService(db, repos),` to the returned object. In `import-services.ts`, extend the Omit to `Omit<Repositories, "trackImport" | "guideImport" | "trackDeletion" | "layoutGeometry">`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/data && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/data
git commit -m "feat(web): add a transactional service to save a layout outline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: OSM client

**Files:**

- Create: `apps/web/src/features/osm-map/osm-client.ts`
- Modify: `apps/web/package.json` (dependency), `apps/web/next.config.ts` (`transpilePackages`)
- Test: `apps/web/src/features/osm-map/osm-client.test.ts`

**Interfaces:**

- Consumes: `OsmElement`, `haversine`, `OsmNode` from `@track-day/osm-track`.
- Produces:

  ```ts
  type BBox = [south: number, west: number, north: number, east: number];
  interface Place {
    id: string;
    name: string;
    description: string;
    bbox: BBox;
  }
  type OsmErrorKind = "offline" | "busy" | "not-found" | "too-large" | "network";
  class OsmError extends Error {
    kind: OsmErrorKind;
  }
  interface ClientOptions {
    fetch?: typeof fetch;
    retryDelayMs?: number;
  }
  function searchPlaces(query: string, options?: ClientOptions): Promise<Place[]>;
  function fetchRaceways(bbox: BBox, options?: ClientOptions): Promise<OsmElement[]>;
  interface OsmClient {
    searchPlaces: typeof searchPlaces;
    fetchRaceways: typeof fetchRaceways;
  }
  const osmClient: OsmClient;
  ```

- [ ] **Step 1: Wire the package into the app**

```bash
pnpm --filter web add @track-day/osm-track@workspace:*
```

In `apps/web/next.config.ts`, change `transpilePackages` to `["@track-day/schema", "@track-day/prompts", "@track-day/osm-track"]`.

- [ ] **Step 2: Write the failing test**

`apps/web/src/features/osm-map/osm-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRaceways, OsmError, searchPlaces } from "./osm-client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const nominatimRow = {
  osm_type: "way",
  osm_id: 123,
  name: "Autódromo José Carlos Pace",
  display_name: "Autódromo José Carlos Pace, São Paulo, Brasil",
  boundingbox: ["-23.712", "-23.695", "-46.706", "-46.690"],
};
const INTERLAGOS: [number, number, number, number] = [-23.712, -46.706, -23.695, -46.69];

afterEach(() => vi.restoreAllMocks());

describe("searchPlaces", () => {
  it("queries Nominatim with the encoded text and maps the bounding box", async () => {
    const fetch = vi.fn().mockResolvedValue(json([nominatimRow]));
    const places = await searchPlaces("Autódromo José Carlos Pace São Paulo", { fetch });

    const url = new URL(fetch.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("Autódromo José Carlos Pace São Paulo");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(places).toEqual([
      {
        id: "way/123",
        name: "Autódromo José Carlos Pace",
        description: "Autódromo José Carlos Pace, São Paulo, Brasil",
        bbox: INTERLAGOS,
      },
    ]);
  });

  it("explains an empty result", async () => {
    const fetch = vi.fn().mockResolvedValue(json([]));
    await expect(searchPlaces("Nowhere Ring", { fetch })).rejects.toMatchObject({
      kind: "not-found",
      message: expect.stringContaining("No places found for “Nowhere Ring”"),
    });
  });

  it("does not call the network when offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetch = vi.fn();
    await expect(searchPlaces("Interlagos", { fetch })).rejects.toMatchObject({ kind: "offline" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("fetchRaceways", () => {
  it("posts the raceway query for the bounding box", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ elements: [{ type: "node", id: 1, lat: 0, lon: 0 }] }));
    const elements = await fetchRaceways(INTERLAGOS, { fetch });

    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init.method).toBe("POST");
    expect(new URLSearchParams(init.body as string).get("data")).toBe(
      '[out:json][timeout:60];way["highway"="raceway"](-23.712,-46.706,-23.695,-46.69);out body;>;out body qt;',
    );
    expect(elements).toHaveLength(1);
  });

  it("retries once when Overpass is rate-limited", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ elements: [] }));
    await expect(fetchRaceways(INTERLAGOS, { fetch, retryDelayMs: 0 })).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports busy after a second 504", async () => {
    const fetch = vi.fn().mockResolvedValue(json({}, 504));
    await expect(fetchRaceways(INTERLAGOS, { fetch, retryDelayMs: 0 })).rejects.toMatchObject({
      kind: "busy",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("treats a 200 with a timeout remark as busy, not as an empty area", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({ elements: [], remark: 'runtime error: Query timed out in "query"' }),
      );
    await expect(fetchRaceways(INTERLAGOS, { fetch })).rejects.toMatchObject({ kind: "busy" });
  });

  it("rejects an area larger than a circuit without querying", async () => {
    const fetch = vi.fn();
    await expect(fetchRaceways([-23.8, -46.8, -23.4, -46.4], { fetch })).rejects.toMatchObject({
      kind: "too-large",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("turns a network failure into a readable error", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await fetchRaceways(INTERLAGOS, { fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OsmError);
    expect(error).toMatchObject({ kind: "network", message: "Couldn’t reach OpenStreetMap." });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/osm-map/osm-client.test.ts`
Expected: FAIL ("Failed to resolve import ./osm-client").

- [ ] **Step 4: Implement `osm-client.ts`**

```ts
import { haversine, type OsmElement, type OsmNode } from "@track-day/osm-track";

/** south, west, north, east */
export type BBox = [number, number, number, number];

export interface Place {
  id: string;
  name: string;
  description: string;
  bbox: BBox;
}

export type OsmErrorKind = "offline" | "busy" | "not-found" | "too-large" | "network";

export class OsmError extends Error {
  override name = "OsmError";
  constructor(
    readonly kind: OsmErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  fetch?: typeof fetch;
  retryDelayMs?: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";
/** A circuit fits well inside this; anything bigger is a city or region. */
const MAX_DIAGONAL_M = 10_000;

const BUSY = "OpenStreetMap is busy — try again in a minute.";
const UNREACHABLE = "Couldn’t reach OpenStreetMap.";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  options: ClientOptions,
): Promise<Response> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new OsmError("offline", "Adding a map needs an internet connection.");
  }
  const doFetch = options.fetch ?? fetch;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new OsmError("network", UNREACHABLE);
    }
    if (res.status === 429 || res.status === 504) {
      if (attempt === 0) {
        await sleep(options.retryDelayMs ?? 5000);
        continue;
      }
      throw new OsmError("busy", BUSY);
    }
    if (!res.ok) throw new OsmError("network", `${UNREACHABLE} (HTTP ${res.status})`);
    return res;
  }
}

interface NominatimRow {
  osm_type: string;
  osm_id: number;
  name?: string;
  display_name: string;
  /** [minLat, maxLat, minLon, maxLon] as strings */
  boundingbox: [string, string, string, string];
}

/** Searches places by name. Call only on an explicit user action (Nominatim policy). */
export async function searchPlaces(query: string, options: ClientOptions = {}): Promise<Place[]> {
  const url = `${NOMINATIM}?${new URLSearchParams({ format: "jsonv2", limit: "5", q: query })}`;
  const res = await request(url, { headers: { Accept: "application/json" } }, 15_000, options);
  const rows = (await res.json()) as NominatimRow[];
  if (rows.length === 0) {
    throw new OsmError(
      "not-found",
      `No places found for “${query}”. Try the circuit’s official name or the city.`,
    );
  }
  return rows.map((r) => ({
    id: `${r.osm_type}/${r.osm_id}`,
    name: r.name || r.display_name.split(",")[0]!,
    description: r.display_name,
    bbox: [
      Number(r.boundingbox[0]),
      Number(r.boundingbox[2]),
      Number(r.boundingbox[1]),
      Number(r.boundingbox[3]),
    ],
  }));
}

const corner = (lat: number, lon: number): OsmNode => ({ type: "node", id: 0, lat, lon });

/** Raceway ways (and their nodes) inside the box — the same query as scripts/osm-outline. */
export async function fetchRaceways(
  bbox: BBox,
  options: ClientOptions = {},
): Promise<OsmElement[]> {
  const [s, w, n, e] = bbox;
  if (haversine(corner(s, w), corner(n, e)) > MAX_DIAGONAL_M) {
    throw new OsmError(
      "too-large",
      "That area is too large — pick the circuit itself, not the city.",
    );
  }
  const query = `[out:json][timeout:60];way["highway"="raceway"](${s},${w},${n},${e});out body;>;out body qt;`;
  const res = await request(
    OVERPASS,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
    },
    60_000,
    options,
  );
  const body = (await res.json()) as { elements?: OsmElement[]; remark?: string };
  // Overpass reports server-side timeouts as a 200 with a remark and no data.
  if (body.remark && /runtime error|timed out|out of memory/i.test(body.remark)) {
    throw new OsmError("busy", BUSY);
  }
  return body.elements ?? [];
}

export interface OsmClient {
  searchPlaces: typeof searchPlaces;
  fetchRaceways: typeof fetchRaceways;
}

export const osmClient: OsmClient = { searchPlaces, fetchRaceways };
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/osm-map/osm-client.test.ts && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/next.config.ts apps/web/src/features/osm-map
git commit -m "feat(web): add an OpenStreetMap client for place search and raceways

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Attribution

**Files:**

- Create: `apps/web/src/shared/ui/osm-attribution.tsx`
- Modify: `apps/web/src/features/track-view/track-view-page.tsx` (main return's `canvas`), `apps/web/src/features/practice/practice-page.tsx` (real-geometry diagram return)
- Test: `apps/web/src/shared/ui/osm-attribution.test.tsx`

**Interfaces:**

- Produces: `OsmAttribution({ className }: { className?: string })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OsmAttribution } from "./osm-attribution";

describe("OsmAttribution", () => {
  it("credits OpenStreetMap contributors with a link to the copyright page", () => {
    render(<OsmAttribution />);
    expect(screen.getByText(/Map data ©/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenStreetMap contributors" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/shared/ui/osm-attribution.test.tsx`
Expected: FAIL ("Failed to resolve import ./osm-attribution").

- [ ] **Step 3: Implement and place it**

`apps/web/src/shared/ui/osm-attribution.tsx`:

```tsx
import { cn } from "@/shared/lib/utils";

/** ODbL attribution, required wherever OSM-derived geometry is shown. */
export function OsmAttribution({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] text-muted", className)}>
      Map data ©{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        OpenStreetMap contributors
      </a>
    </p>
  );
}
```

In `track-view-page.tsx`, import it and wrap the final return's `canvas={<TrackCanvas … />}` as:

```tsx
      canvas={
        <>
          <TrackCanvas
            {/* …existing props unchanged… */}
          />
          {layout.outlineSource === "osm" && (
            <OsmAttribution className="absolute right-2 bottom-1 z-10 rounded bg-background/80 px-1.5 max-md:bottom-16" />
          )}
        </>
      }
```

(Keep the existing `<TrackCanvas>` element and its props exactly as they are; only wrap it.)

In `practice-page.tsx`, in the branch `if (outline && layout.lengthMeters && positions.length === s.corners.length)`, change the return to:

```tsx
return (
  <>
    <CornerDiagram diagram={diagram} apexLabels={apexLabels} brakeLabel={brakeLabel} />
    {layout.outlineSource === "osm" && <OsmAttribution className="text-center" />}
  </>
);
```

and import `OsmAttribution`.

- [ ] **Step 4: Run tests and checks**

Run: `pnpm --filter web exec vitest run && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/ui apps/web/src/features/track-view/track-view-page.tsx apps/web/src/features/practice/practice-page.tsx
git commit -m "feat(web): credit OpenStreetMap where OSM outlines are shown

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Corner matching and preview

**Files:**

- Create: `apps/web/src/features/osm-map/match-corners.ts`, `apps/web/src/features/osm-map/map-preview.tsx`
- Test: `apps/web/src/features/osm-map/match-corners.test.ts`, `apps/web/src/features/osm-map/map-preview.test.tsx`

**Interfaces:**

- Consumes: `OsmCorner` from `@track-day/osm-track`; `Corner` from `@track-day/schema`; `createTrackPath` from `@/features/track-view/geometry/path`; `boundsOf` from `@/features/track-view/geometry/bounds`.
- Produces:

  ```ts
  type PositionSource = "osm" | "distance" | "none";
  interface MatchedCorner {
    corner: Corner;
    source: PositionSource;
    fraction: number | null;
  }
  function matchCorners(corners: Corner[], osm: OsmCorner[], lengthMeters: number): MatchedCorner[];
  function cornerPositionsToSave(
    matched: MatchedCorner[],
  ): { cornerId: string; pathPosition: number }[];
  function MapPreview(props: {
    outlinePath: string;
    matched: MatchedCorner[];
    label: string;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

`match-corners.test.ts`:

```ts
import type { OsmCorner } from "@track-day/osm-track";
import type { Corner } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { cornerPositionsToSave, matchCorners } from "./match-corners";

const corner = (number: number, distanceFromStartMeters: number | null): Corner =>
  ({ id: `c${number}`, number, distanceFromStartMeters, pathPosition: null }) as Corner;
const osm = (number: number, position: number): OsmCorner => ({
  number,
  name: null,
  position,
  direction: "left",
});

describe("matchCorners", () => {
  it("uses OSM positions by number, else distance, else nothing", () => {
    const matched = matchCorners(
      [corner(1, 400), corner(2, 1000), corner(3, null)],
      [osm(1, 0.1), osm(9, 0.9)],
      4000,
    );
    expect(matched.map((m) => [m.corner.number, m.source, m.fraction])).toEqual([
      [1, "osm", 0.1],
      [2, "distance", 0.25],
      [3, "none", null],
    ]);
  });

  it("uses the given lap length for distance placement", () => {
    expect(matchCorners([corner(2, 1000)], [], 5000)[0]!.fraction).toBe(0.2);
  });

  it("saves positions for OSM-matched corners only", () => {
    const matched = matchCorners([corner(1, 400), corner(2, 1000)], [osm(1, 0.1)], 4000);
    expect(cornerPositionsToSave(matched)).toEqual([{ cornerId: "c1", pathPosition: 0.1 }]);
  });
});
```

`map-preview.test.tsx`:

```tsx
import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapPreview } from "./map-preview";

const c = (number: number) => ({ id: `c${number}`, number }) as Corner;

describe("MapPreview", () => {
  it("draws the outline and a marker per placeable corner", () => {
    const { container } = render(
      <MapPreview
        outlinePath="M0 0 L100 0 L100 100 L0 100 Z"
        matched={[
          { corner: c(1), source: "osm", fraction: 0.1 },
          { corner: c(2), source: "distance", fraction: 0.5 },
          { corner: c(3), source: "none", fraction: null },
        ]}
        label="Preview of Interlagos"
      />,
    );
    expect(screen.getByRole("img", { name: "Preview of Interlagos" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-preview-corner]")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/osm-map/match-corners.test.ts src/features/osm-map/map-preview.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`match-corners.ts`:

```ts
import type { OsmCorner } from "@track-day/osm-track";
import type { Corner } from "@track-day/schema";
import { cornerFraction } from "@/features/track-view/geometry/anchors";

export type PositionSource = "osm" | "distance" | "none";

export interface MatchedCorner {
  corner: Corner;
  source: PositionSource;
  fraction: number | null;
}

/** The layout's own corners, placed by OSM's tag for the same number when there is one. */
export function matchCorners(
  corners: Corner[],
  osm: OsmCorner[],
  lengthMeters: number,
): MatchedCorner[] {
  const byNumber = new Map(osm.map((o) => [o.number, o.position]));
  return corners.map((corner) => {
    const tagged = byNumber.get(corner.number);
    if (tagged !== undefined) return { corner, source: "osm", fraction: tagged };
    const fraction = cornerFraction({ ...corner, pathPosition: null }, { lengthMeters });
    return fraction === null
      ? { corner, source: "none", fraction: null }
      : { corner, source: "distance", fraction };
  });
}

export function cornerPositionsToSave(matched: MatchedCorner[]) {
  return matched.flatMap((m) =>
    m.source === "osm" && m.fraction !== null
      ? [{ cornerId: m.corner.id, pathPosition: m.fraction }]
      : [],
  );
}
```

`map-preview.tsx`:

```tsx
import { useMemo } from "react";
import { boundsOf } from "@/features/track-view/geometry/bounds";
import { createTrackPath } from "@/features/track-view/geometry/path";
import type { MatchedCorner } from "./match-corners";

/** A static, non-interactive look at an outline with the layout's corners on it. */
export function MapPreview({
  outlinePath,
  matched,
  label,
}: {
  outlinePath: string;
  matched: MatchedCorner[];
  label: string;
}) {
  const path = useMemo(() => createTrackPath(outlinePath), [outlinePath]);
  const b = useMemo(() => boundsOf(path.sample(200)), [path]);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const pad = size * 0.08;
  const r = size * 0.025;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`}
      className="aspect-square w-full rounded-lg bg-canvas"
    >
      <path d={outlinePath} fill="none" className="stroke-track" strokeWidth={size * 0.012} />
      {matched.map(({ corner, source, fraction }) => {
        if (fraction === null) return null;
        const p = path.pointAt(fraction);
        return (
          <g key={corner.id} data-preview-corner={source}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              className={source === "osm" ? "fill-marker" : "fill-muted"}
            />
            <text
              x={p.x}
              y={p.y}
              dy="0.35em"
              textAnchor="middle"
              fontSize={r * 1.1}
              className="fill-marker-foreground font-semibold"
            >
              {corner.number}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter web exec vitest run src/features/osm-map && pnpm --filter web typecheck`
Expected: PASS. If `boundsOf` returns a different shape than `{ minX, minY, maxX, maxY }`, read `geometry/types.ts` (`Bounds`) and adapt the field names.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/osm-map
git commit -m "feat(web): match layout corners to OpenStreetMap and preview the outline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Add-map panel and save

**Files:**

- Create: `apps/web/src/features/osm-map/use-save-map.ts`, `apps/web/src/features/osm-map/add-map-panel.tsx`
- Modify: `apps/web/src/features/track-view/no-outline.tsx`, `apps/web/src/features/track-view/no-outline.test.tsx`, `apps/web/src/features/track-view/track-view-page.tsx` (pass `track`/`layout` to `NoOutline`)
- Test: `apps/web/src/features/osm-map/add-map-panel.test.tsx`

**Interfaces:**

- Consumes: Tasks 4, 5 and 7, plus `buildTrackGeometry` (Task 1).
- Produces: `AddMapPanel({ track, layout, corners, onClose, client? }: { track: Track; layout: Layout; corners: Corner[]; onClose(): void; client?: OsmClient })`; `NoOutline({ track, layout, corners, onSelect })`.
- UI text used by tests and e2e:
  - buttons: "Add map from OpenStreetMap", "Search", "Save map", "Cancel", "Try again"
  - field: "Circuit"
  - labels: "Position from OpenStreetMap", "Placed from distance", "Not on the map", "Loop"
  - checkbox: /Use OpenStreetMap's length/

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/osm-map/add-map-panel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OsmElement } from "@track-day/osm-track";
import type { Corner, Layout, Track } from "@track-day/schema";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import interlagosOsm from "../../../../../packages/osm-track/test/fixtures/interlagos.json";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { AddMapPanel } from "./add-map-panel";
import type { OsmClient, Place } from "./osm-client";

const elements = interlagosOsm.elements as OsmElement[];
const place: Place = {
  id: "way/1",
  name: "Autódromo José Carlos Pace",
  description: "São Paulo, Brasil",
  bbox: [-23.712, -46.706, -23.695, -46.69],
};
const track = { id: "t1", name: "Autódromo José Carlos Pace", city: "São Paulo" } as Track;
const layout = {
  id: "l1",
  lengthMeters: 4309,
  direction: "anticlockwise",
  outlinePath: null,
} as Layout;
const corners = [
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `c${i + 1}`,
    number: i + 1,
    distanceFromStartMeters: (i + 1) * 250,
  })),
  { id: "c16", number: 16, distanceFromStartMeters: 4200 },
  { id: "c17", number: 17, distanceFromStartMeters: null },
] as Corner[];

function setup({
  client = {
    searchPlaces: vi.fn().mockResolvedValue([place]),
    fetchRaceways: vi.fn().mockResolvedValue(elements),
  } as OsmClient,
  layoutOverride = {},
} = {}) {
  const saveOutline = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider
        repositories={{ layoutGeometry: { saveOutline } } as unknown as Repositories}
      >
        <AddMapPanel
          track={track}
          layout={{ ...layout, ...layoutOverride }}
          corners={corners}
          onClose={onClose}
          client={client}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { client, saveOutline, onClose, user: userEvent.setup() };
}

async function searchAndPick(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("button", { name: /Autódromo José Carlos Pace/ }));
  await screen.findByRole("img", { name: /Preview/ });
}

describe("AddMapPanel", () => {
  it("prefills the search with the track name and city", () => {
    setup();
    expect(screen.getByLabelText("Circuit")).toHaveValue("Autódromo José Carlos Pace São Paulo");
  });

  it("previews the OSM loop and labels where each corner comes from", async () => {
    const { user, client } = setup();
    await searchAndPick(user);

    expect(client.fetchRaceways).toHaveBeenCalledWith(place.bbox);
    const list = screen.getByRole("list", { name: "Corner positions" });
    expect(within(list).getAllByText("Position from OpenStreetMap")).toHaveLength(15);
    expect(within(list).getByText("Placed from distance")).toBeInTheDocument();
    expect(within(list).getByText("Not on the map")).toBeInTheDocument();
    expect(screen.getByText(/Start line from OpenStreetMap/)).toBeInTheDocument();
  });

  it("saves the outline with OSM corner positions only", async () => {
    const { user, saveOutline, onClose } = setup();
    await searchAndPick(user);

    await user.click(screen.getByRole("button", { name: "Save map" }));

    expect(saveOutline).toHaveBeenCalledTimes(1);
    const input = saveOutline.mock.calls[0]![0];
    expect(input).toMatchObject({ layoutId: "l1", outlineSource: "osm" });
    expect(input.outlinePath).toMatch(/^M/);
    expect(input.cornerPositions).toHaveLength(15);
    expect(input.cornerPositions.map((p: { cornerId: string }) => p.cornerId)).not.toContain("c16");
    expect(input).not.toHaveProperty("lengthMeters");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("saves the loop the user selected, not the first one", async () => {
    const { user, saveOutline } = setup();
    await searchAndPick(user);
    const firstPath = screen
      .getByRole("img", { name: /Preview/ })
      .querySelector("path")!
      .getAttribute("d");

    await user.selectOptions(screen.getByLabelText("Loop"), "1");
    await user.click(screen.getByRole("button", { name: "Save map" }));

    expect(saveOutline.mock.calls[0]![0].outlinePath).not.toBe(firstPath);
  });

  it("offers OSM's length when the layout length is off, and saves it when chosen", async () => {
    const { user, saveOutline } = setup({ layoutOverride: { lengthMeters: 3900 } });
    await searchAndPick(user);

    await user.click(screen.getByRole("checkbox", { name: /Use OpenStreetMap's length/ }));
    await user.click(screen.getByRole("button", { name: "Save map" }));

    expect(saveOutline.mock.calls[0]![0].lengthMeters).toBeGreaterThan(4200);
  });

  it("explains a street circuit with no raceway loop", async () => {
    const { user } = setup({
      client: {
        searchPlaces: vi.fn().mockResolvedValue([place]),
        fetchRaceways: vi
          .fn()
          .mockResolvedValue(
            (await import("../../../../../packages/osm-track/test/fixtures/monaco.json"))
              .elements as OsmElement[],
          ),
      },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /Autódromo/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/No loop near 4,309 m/);
    expect(alert).toHaveTextContent(/Street circuits/);
  });

  it("shows OSM client errors", async () => {
    const { OsmError } = await import("./osm-client");
    const { user } = setup({
      client: {
        searchPlaces: vi
          .fn()
          .mockRejectedValue(
            new OsmError("busy", "OpenStreetMap is busy — try again in a minute."),
          ),
        fetchRaceways: vi.fn(),
      },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("OpenStreetMap is busy");
  });

  it("retries the failed request with Try again", async () => {
    const { OsmError } = await import("./osm-client");
    const searchPlaces = vi
      .fn()
      .mockRejectedValueOnce(new OsmError("network", "Couldn’t reach OpenStreetMap."))
      .mockResolvedValueOnce([place]);
    const { user } = setup({ client: { searchPlaces, fetchRaceways: vi.fn() } });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(searchPlaces).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: /Autódromo/ })).toBeInTheDocument();
  });

  it("ignores a slow earlier pick when a later one has already answered", async () => {
    let resolveFirst!: (e: OsmElement[]) => void;
    const other: Place = { ...place, id: "way/2", name: "Kartódromo" };
    const fetchRaceways = vi
      .fn()
      .mockImplementationOnce(() => new Promise<OsmElement[]>((r) => (resolveFirst = r)))
      .mockResolvedValueOnce([]);
    const { user } = setup({
      client: { searchPlaces: vi.fn().mockResolvedValue([place, other]), fetchRaceways },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /Autódromo/ }));
    await user.click(screen.getByRole("button", { name: /Kartódromo/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no circuit mapped here/);

    resolveFirst(elements);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("img", { name: /Preview/ })).not.toBeInTheDocument();
  });

  it("explains a layout without a lap length instead of searching", () => {
    setup({ layoutOverride: { lengthMeters: null } });
    expect(screen.getByText(/has no lap length/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
  });
});
```

Update `apps/web/src/features/track-view/no-outline.test.tsx`: render with the new props and assert the button:

```tsx
import type { Corner, Layout, Track } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { NoOutline } from "./no-outline";

const corner = (number: number, name: string | null): Corner =>
  ({ id: `c${number}`, number, name, direction: "left" }) as Corner;
const track = { id: "t1", name: "Test", city: null } as Track;
const layout = {
  id: "l1",
  lengthMeters: 4309,
  direction: "clockwise",
  outlinePath: null,
} as Layout;

function renderNoOutline(onSelect = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{} as Repositories}>
        <NoOutline
          track={track}
          layout={layout}
          corners={[corner(1, "S do Senna"), corner(2, null)]}
          onSelect={onSelect}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return onSelect;
}

describe("NoOutline", () => {
  it("lists the corners in lap order and selects one", async () => {
    const onSelect = renderNoOutline();
    expect(screen.getByText(/no outline yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /S do Senna/ }));
    expect(onSelect).toHaveBeenCalledWith("c1");
    expect(screen.getByRole("button", { name: /Unnamed/ })).toBeInTheDocument();
  });

  it("opens the OpenStreetMap panel", async () => {
    renderNoOutline();
    await userEvent.click(screen.getByRole("button", { name: "Add map from OpenStreetMap" }));
    expect(screen.getByLabelText("Circuit")).toHaveValue("Test");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/osm-map/add-map-panel.test.tsx src/features/track-view/no-outline.test.tsx`
Expected: FAIL (`./add-map-panel` not found; NoOutline has no button).

- [ ] **Step 3: Implement `use-save-map.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import type { SaveOutlineInput } from "@/data/repositories";

export function useSaveMap(onSaved: () => void) {
  const { layoutGeometry } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveOutlineInput) => layoutGeometry.saveOutline(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      onSaved();
    },
  });
}
```

- [ ] **Step 4: Implement `add-map-panel.tsx`**

```tsx
"use client";

import { buildTrackGeometry, type OsmElement } from "@track-day/osm-track";
import type { Corner, Layout, Track } from "@track-day/schema";
import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { MapPreview } from "./map-preview";
import { cornerPositionsToSave, matchCorners, type PositionSource } from "./match-corners";
import { OsmError, osmClient, type OsmClient, type Place } from "./osm-client";
import { useSaveMap } from "./use-save-map";

const SOURCE_LABEL: Record<PositionSource, string> = {
  osm: "Position from OpenStreetMap",
  distance: "Placed from distance",
  none: "Not on the map",
};

const meters = (n: number) => `${n.toLocaleString("en-US")} m`;

interface Problem {
  message: string;
  hint?: string;
  link?: string;
}

const messageOf = (e: unknown) =>
  e instanceof OsmError ? e.message : "Couldn’t reach OpenStreetMap.";

export function AddMapPanel({
  track,
  layout,
  corners,
  onClose,
  client = osmClient,
}: {
  track: Track;
  layout: Layout;
  corners: Corner[];
  onClose(): void;
  client?: OsmClient;
}) {
  const id = useId();
  const [query, setQuery] = useState([track.name, track.city].filter(Boolean).join(" "));
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [picked, setPicked] = useState<{ place: Place; elements: OsmElement[] } | null>(null);
  const [loopIndex, setLoopIndex] = useState(0);
  const [useOsmLength, setUseOsmLength] = useState(false);
  // Only the latest pick may show its result.
  const pickToken = useRef(0);
  /** The last network action, so an OSM error can offer "Try again". */
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const save = useSaveMap(onClose);

  const lengthMeters = layout.lengthMeters;
  const result = useMemo(
    () =>
      picked && lengthMeters
        ? buildTrackGeometry(picked.elements, {
            lengthMeters,
            direction: layout.direction ?? "clockwise",
            loopIndex,
          })
        : null,
    [picked, lengthMeters, layout.direction, loopIndex],
  );

  if (!lengthMeters) {
    return (
      <p className="text-sm text-muted">
        This layout has no lap length, so its circuit can’t be matched in OpenStreetMap.
      </p>
    );
  }

  async function handleSearch() {
    lastAction.current = handleSearch;
    setBusy(true);
    setProblem(null);
    setPicked(null);
    try {
      setPlaces(await client.searchPlaces(query.trim()));
    } catch (e) {
      setPlaces(null);
      setProblem({ message: messageOf(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handlePick(place: Place) {
    lastAction.current = () => handlePick(place);
    const token = ++pickToken.current;
    setBusy(true);
    setProblem(null);
    setPicked(null);
    setLoopIndex(0);
    setUseOsmLength(false);
    try {
      const elements = await client.fetchRaceways(place.bbox);
      if (token !== pickToken.current) return;
      setPicked({ place, elements });
    } catch (e) {
      if (token !== pickToken.current) return;
      setProblem({ message: messageOf(e) });
    } finally {
      if (token === pickToken.current) setBusy(false);
    }
  }

  const failure =
    result && !result.ok
      ? result.reason === "no-raceway"
        ? {
            message: "OpenStreetMap has no circuit mapped here.",
            link: `https://www.openstreetmap.org/${picked!.place.id}`,
          }
        : {
            message: `No loop near ${meters(lengthMeters)}.${
              result.loopsFound.length > 0
                ? ` Loops found: ${result.loopsFound
                    .slice()
                    .sort((a, b) => Math.abs(a - lengthMeters) - Math.abs(b - lengthMeters))
                    .slice(0, 4)
                    .sort((a, b) => a - b)
                    .map(meters)
                    .join(", ")}.`
                : ""
            }`,
            hint: "Street circuits are often mapped as ordinary roads, not raceways.",
          }
      : null;
  const shown = problem ?? failure;

  const preview = result?.ok ? result : null;
  const finalLength = preview && useOsmLength ? preview.loopLengthMeters : lengthMeters;
  const matched = preview ? matchCorners(corners, preview.corners, finalLength) : [];
  const lengthOff =
    preview && Math.abs(preview.loopLengthMeters - lengthMeters) / lengthMeters > 0.02;

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSearch();
        }}
      >
        <Label htmlFor={`${id}-q`}>Circuit</Label>
        <div className="flex gap-2">
          <Input id={`${id}-q`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" disabled={busy || query.trim() === ""}>
            Search
          </Button>
        </div>
      </form>

      {places && (
        <ul aria-label="Places" className="space-y-1">
          {places.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void handlePick(p)}
                aria-pressed={picked?.place.id === p.id}
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-surface aria-pressed:border-foreground"
              >
                <span className="font-medium">{p.name}</span>
                <span className="block text-xs text-muted">{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="text-sm text-muted">
        {busy && "Looking up the circuit…"}
      </p>

      {shown && (
        <div role="alert" className="rounded-lg border border-danger/40 p-3 text-sm">
          <p className="text-danger">{shown.message}</p>
          {"hint" in shown && shown.hint && <p className="mt-1 text-muted">{shown.hint}</p>}
          {"link" in shown && shown.link && (
            <a
              href={shown.link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block underline"
            >
              Open in OpenStreetMap
            </a>
          )}
          {problem && lastAction.current && (
            <Button variant="outline" className="mt-2" onClick={() => void lastAction.current?.()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          <MapPreview
            outlinePath={preview.outlinePath}
            matched={matched}
            label={`Preview of ${track.name} from OpenStreetMap`}
          />
          <p className="text-sm">
            Loop {meters(preview.loopLengthMeters)} · layout {meters(lengthMeters)} ·{" "}
            {preview.start === "tagged"
              ? "Start line from OpenStreetMap"
              : "Start line approximate"}
          </p>
          {preview.loops.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-loop`}>Loop</Label>
              <select
                id={`${id}-loop`}
                value={loopIndex}
                onChange={(e) => setLoopIndex(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {preview.loops.map((l, i) => (
                  <option key={i} value={i}>
                    {meters(l.lengthMeters)} · {l.taggedCorners} tagged corners
                  </option>
                ))}
              </select>
            </div>
          )}
          {lengthOff && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useOsmLength}
                onChange={(e) => setUseOsmLength(e.target.checked)}
              />
              Use OpenStreetMap's length ({meters(preview.loopLengthMeters)}) for this layout
            </label>
          )}
          {preview.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <ol
            aria-label="Corner positions"
            className="divide-y divide-border rounded-lg border border-border text-sm"
          >
            {matched.map(({ corner, source }) => (
              <li key={corner.id} className="flex justify-between px-3 py-1.5">
                <span>
                  T{corner.number}
                  {corner.name && <span className="text-muted"> · {corner.name}</span>}
                </span>
                <span className="text-muted">{SOURCE_LABEL[source]}</span>
              </li>
            ))}
          </ol>
          {save.error && (
            <p role="alert" className="text-sm text-danger">
              Could not save the map: {save.error.message}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        {preview && (
          <Button
            disabled={save.isPending || save.isSuccess}
            onClick={() =>
              save.mutate({
                layoutId: layout.id,
                outlinePath: preview.outlinePath,
                outlineSource: "osm",
                cornerPositions: cornerPositionsToSave(matched),
                ...(useOsmLength && lengthOff && { lengthMeters: preview.loopLengthMeters }),
              })
            }
          >
            {save.isPending ? "Saving…" : "Save map"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Host it in `NoOutline` and pass props from the track view**

`apps/web/src/features/track-view/no-outline.tsx`:

```tsx
"use client";

import type { Corner, Layout, Track } from "@track-day/schema";
import { useState, useSyncExternalStore } from "react";
import { AddMapPanel } from "@/features/osm-map/add-map-panel";
import { Button } from "@/shared/ui/button";
import { CornerList } from "./corner-details";

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Stands in for the map when a layout has no outline (e.g. right after an AI import). */
export function NoOutline({
  track,
  layout,
  corners,
  onSelect,
}: {
  track: Track;
  layout: Layout;
  corners: Corner[];
  onSelect(id: string): void;
}) {
  const [adding, setAdding] = useState(false);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pt-20 pb-24">
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-border bg-background p-4">
        {adding ? (
          <>
            <h2 className="font-medium">Add map from OpenStreetMap</h2>
            <AddMapPanel
              track={track}
              layout={layout}
              corners={corners}
              onClose={() => setAdding(false)}
            />
          </>
        ) : (
          <>
            <div className="space-y-2">
              <h2 className="font-medium">Corners</h2>
              <p className="text-sm text-muted">
                This layout has no outline yet, so there’s no map. Add one from OpenStreetMap, or
                the map appears once an outline is added another way.
              </p>
              <Button onClick={() => setAdding(true)} disabled={!online}>
                Add map from OpenStreetMap
              </Button>
              {!online && (
                <p className="text-xs text-muted">Adding a map needs an internet connection.</p>
              )}
            </div>
            <CornerList corners={corners} onSelect={onSelect} />
          </>
        )}
      </div>
    </div>
  );
}
```

In `track-view-page.tsx`, change `<NoOutline corners={corners} onSelect={selectCorner} />` to `<NoOutline track={track} layout={layout} corners={corners} onSelect={selectCorner} />`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter web exec vitest run && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- If importing the fixture JSON fails to typecheck because the file is outside the project, add `"../../packages/osm-track/test/fixtures/*.json"` to `apps/web/tsconfig.json`'s `include`.
- If the "loop the user selected" test finds only one loop, the Interlagos fixture has fewer than two candidates. Check `buildTrackGeometry(...).loops.length` (Task 1 asserts > 1).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/osm-map apps/web/src/features/track-view apps/web/tsconfig.json
git commit -m "feat(web): add a map from OpenStreetMap to a layout without one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end and docs

**Files:**

- Create: `apps/web/e2e/osm-map.spec.ts`
- Modify: `docs/adr/005-track-geometry.md`, `docs/PLAN.md`, `docs/superpowers/specs/2026-10-06-osm-map-import-design.md` (panel placement note)

**Interfaces:**

- Consumes: UI text from Task 8; attribution from Task 6.

- [ ] **Step 1: Write the e2e test**

`apps/web/e2e/osm-map.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import interlagos from "../../../examples/interlagos.track.json";
import interlagosOsm from "../../../packages/osm-track/test/fixtures/interlagos.json";

/** Interlagos as an AI import produces it: no geometry, no source. */
function aiAnswer(): string {
  const layout: Record<string, unknown> = { ...interlagos.layout };
  for (const key of ["outlinePath", "outlineSource", "racingLinePath", "rotation"])
    delete layout[key];
  const corners = interlagos.corners.map((c) => {
    const copy: Record<string, unknown> = { ...c };
    delete copy.pathPosition;
    delete copy.labelOffset;
    return copy;
  });
  return JSON.stringify({ ...interlagos, layout, corners });
}

test("adds a map from OpenStreetMap to an imported track", async ({ page }) => {
  // Recorded responses: CI never calls the live OSM services.
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      json: [
        {
          osm_type: "way",
          osm_id: 1,
          name: "Autódromo José Carlos Pace",
          display_name: "Autódromo José Carlos Pace, São Paulo, Brasil",
          boundingbox: ["-23.712", "-23.695", "-46.706", "-46.690"],
        },
      ],
    }),
  );
  await page.route("https://overpass-api.de/**", (route) => route.fulfill({ json: interlagosOsm }));

  await page.goto("/tracks/import/");
  await page.getByLabel("AI answer").fill(aiAnswer());
  await page.getByRole("button", { name: "Check JSON" }).click();
  await page.getByRole("button", { name: "Save track" }).click();
  await expect(page.getByText(/no outline yet/)).toBeVisible();

  await page.getByRole("button", { name: "Add map from OpenStreetMap" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /Autódromo José Carlos Pace/ }).click();
  await expect(page.getByText("Position from OpenStreetMap").first()).toBeVisible();
  await page.getByRole("button", { name: "Save map" }).click();

  await expect(page.getByRole("img", { name: /Map of Autódromo José Carlos Pace/ })).toBeVisible();
  await expect(page.locator("[data-corner]")).toHaveCount(interlagos.corners.length);
  await expect(page.getByRole("link", { name: "OpenStreetMap contributors" })).toBeVisible();
});
```

- [ ] **Step 2: Build and run the whole e2e suite**

Run: `pnpm --filter web build && pnpm test:e2e`
Expected: all specs PASS on `chromium` and `mobile`, including the existing ones (the samples now carry `outlineSource`, so they show the attribution too).

- [ ] **Step 3: Docs**

`docs/adr/005-track-geometry.md`: after the "Sample outlines come from OpenStreetMap" bullet, add:

```markdown
- **Outlines can be added in the app** from OpenStreetMap (Nominatim search + Overpass, from the browser), using the same builder as the script (`packages/osm-track`). `Layout.outlineSource: "osm"` records the origin, and the views show the ODbL attribution for it. Only layouts without an outline can get one this way.
```

`docs/PLAN.md`: change `- [ ] In-app OpenStreetMap outline import (Overpass from the browser, checked against \`lengthMeters\`)`to`- [x] In-app OpenStreetMap outline import (Overpass from the browser, checked against \`lengthMeters\`) — pulled forward, see the 2026-10-06 OSM map import spec`.

In the spec's "Flow and UI" step 5 note, replace "The panel uses the existing `SidePanel` / bottom-sheet component, so it works on phones." with "The panel replaces the corner list inside the no-outline card (full-height, scrollable), so it works on phones without stacking a second side panel."

- [ ] **Step 4: Run the full CI sequence**

Run: `git ls-files -z | xargs -0 pnpm exec prettier --check --ignore-unknown && pnpm typecheck && pnpm lint && pnpm -r exec vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/osm-map.spec.ts docs
git commit -m "test(web): cover adding an OpenStreetMap map end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
