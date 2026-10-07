# In-App Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit corner notes, a car's per-corner values and notes, and the car's turn-in/apex/exit points in the track view; see all of it (with a generated racing line) in practice mode, and jot quick notes from practice.

**Architecture:** No new storage: everything goes through the existing repositories (`useRepositories()`, ADR-001) with React Query mutations. One schema addition, `CornerGuide.notes`. Two pure geometry modules (`nearest.ts`, `corner-line.ts`) turn map clicks into path positions and positions into a line offset to the outside/inside of the track. UI is an edit mode in the track view side panel plus a notes area and quick-note sheet in practice.

**Tech Stack:** TypeScript, pnpm workspaces, Next.js 16 static export, React 19, TanStack Query 5, Dexie 4, Zod 4, Radix (alert-dialog), Vitest + Testing Library + fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-in-app-editing-design.md`

## Global Constraints

- No backend, no new runtime dependencies. All writes through `useRepositories()`.
- `CornerGuide.notes`: `z.string().default("")`. No `CURRENT_SCHEMA_VERSION` bump, no migration, no Dexie version bump.
- Nominal track width for the generated line: **12 m**; points are offset **6 m** (`LINE_OFFSET_M = 6`) × `unitsPerMeter` from the centerline. Outside = opposite side of `corner.direction`.
- Lead-in point **40 m** before turn-in, lead-out **40 m** after exit. Estimated turn-in **60 m** before apex, estimated exit **50 m** after apex.
- Line points must run turn-in → apex → exit in lap order (across start/finish too); out of order is refused. A point more than **300 m** from the corner's own position asks for confirmation.
- Validation limits are the schema's: speeds 0–500, gear and downshift 1–10, brake % 0–100, cue 1–160 characters (`CUE_MAX_LENGTH`).
- Saving a corner guide whose `source` is `"ai"` sets `source: "manual"` and `confidence: null`.
- Quick note format: a new line `YYYY-MM-DD: <text>` (local date) appended to the notes.
- Edit mode is the URL param `edit=1`; the car is the existing `guide` param.
- UI copy is sentence case, uses typographic quotes/apostrophes like the existing code (“ ” ’).
- Commits follow Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before each commit: `pnpm --filter web test`, `pnpm typecheck`, `pnpm lint` all pass.

## Review Focus

1. **A corner across the start/finish line** (e.g. Interlagos T15 → start): turn-in at 0.98 and apex at 0.01 must count as in order, and the line must not cut across the whole lap. (Tests in Task 2 and Task 3.)
2. **Pressing Escape while the quick-note sheet is open** must close the sheet, not leave practice mode; arrows typed in the note must not change corner. (Test in Task 11.)
3. **Panning the map in “Set apex” mode**: a drag must pan, not place a point; only a click/tap places. (Test in Task 7.)
4. **Switching corner or car with unsaved edits** must ask before discarding; with no edits it must not ask. (Test in Task 8.)
5. **Pasting an AI guide that names a corner the layout doesn't have**: nothing is created (no orphan car). (Test in Task 9.)

---

## File map

```
packages/schema/src/entities.ts                 CornerGuide.notes
packages/schema/src/payloads.ts                 guide payload corner notes
packages/schema/json-schema/guide-import.schema.json   regenerated
apps/web/src/data/local/import-services.ts      map notes on import
apps/web/src/features/track-view/geometry/
  nearest.ts                                    nearestFraction, lapDelta, checkLineOrder
  corner-line.ts                                cornerLine, catmullRom, pointsToPath
apps/web/src/features/track-view/edit/
  corner-guide-draft.ts                         pure: empty guide, draft ⇄ patch, appendNote
  use-edit-mutations.ts                         React Query mutations over the repositories
  corner-notes-form.tsx                         corner notes + common mistakes
  corner-guide-form.tsx                         car values + car notes
  line-points.tsx                               Set turn-in / apex / exit
  add-car-dialog.tsx                            name, sim, class; empty or AI guide
  guide-payload.ts                              pure: layout → track payload, payload check
  car-lines.tsx                                 track-view layer with generated lines
apps/web/src/features/track-view/track-canvas.tsx      pick mode (onPick)
apps/web/src/features/track-view/track-view-page.tsx   Edit toggle, car picker, wiring
apps/web/src/features/practice/diagram-geometry.ts     accepts a generated line
apps/web/src/features/practice/corner-diagram.tsx      data-source on the line
apps/web/src/features/practice/practice-card.tsx       notes area
apps/web/src/features/practice/quick-note.tsx          Note button + sheet
apps/web/src/features/practice/navigation/use-manual-navigator.ts   paused option
apps/web/src/features/practice/practice-page.tsx       wiring
apps/web/e2e/editing.spec.ts
docs/adr/007-line-from-points.md, docs/adr/README.md, docs/data-model.md, docs/PLAN.md
```

---

### Task 1: `CornerGuide.notes` in the schema and guide import

**Files:**

- Modify: `packages/schema/src/entities.ts` (CornerGuide, after `downshiftTo`)
- Modify: `packages/schema/src/payloads.ts` (GuideImportPayload corner object)
- Modify: `apps/web/src/data/local/import-services.ts:124-151`
- Regenerate: `packages/schema/json-schema/guide-import.schema.json`
- Test: `packages/schema/src/payloads.test.ts`, `apps/web/src/data/local/import-services.test.ts`

**Interfaces:**

- Produces: `CornerGuide.notes: string` (always present after parse; `""` default). `GuideImportPayload["corners"][number].notes?: string | null`.

- [ ] **Step 1: Write the failing tests**

In `packages/schema/src/payloads.test.ts`, inside `describe("CornerGuide defaults")`, change the existing expectation to include notes:

```ts
expect(CornerGuide.parse(old)).toMatchObject({
  brakePressure: null,
  brakePressurePct: null,
  cue: null,
  downshiftTo: null,
  notes: "",
});
```

and add after that `it`:

```ts
it("keeps notes when present", () => {
  const now = "2026-01-01T00:00:00.000Z";
  const parsed = CornerGuide.parse({
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    guideId: crypto.randomUUID(),
    cornerId: crypto.randomUUID(),
    brakeReference: null,
    brakeMarkerMeters: null,
    entrySpeedKmh: null,
    minSpeedKmh: null,
    exitSpeedKmh: null,
    gear: null,
    line: { turnIn: null, apex: null, exit: null, turnInAt: null, apexAt: null, exitAt: null },
    throttleNotes: "",
    trailBrakeNotes: "",
    priority: null,
    source: "manual",
    confidence: null,
    notes: "Kerb on exit is high",
  });
  expect(parsed.notes).toBe("Kerb on exit is high");
});
```

Add a new block at the end of the file:

```ts
describe("GuideImportPayload notes", () => {
  it("accepts per-corner notes", () => {
    const parsed = GuideImportPayload.parse({
      schemaVersion: 1,
      kind: "guide",
      guide: {},
      corners: [{ cornerNumber: 1, notes: "Bumpy under braking" }],
    });
    expect(parsed.corners[0]!.notes).toBe("Bumpy under braking");
  });
});
```

In `apps/web/src/data/local/import-services.test.ts`, in `describe("importGuide")`, add:

```ts
it("stores per-corner notes, and defaults them to empty", async () => {
  const { layoutId } = await repos.trackImport.importTrack(interlagos);
  const classId = (
    await repos.carClasses.create({
      name: "Road car",
      description: "",
      drivetrain: null,
      downforce: null,
    })
  ).id;
  const { guideId } = await repos.guideImport.importGuide(
    { ...guide, corners: [{ cornerNumber: 1, notes: "Bumpy" }, { cornerNumber: 2 }] },
    { layoutId, target: { carClassId: classId }, sim: null },
  );
  const notes = (await repos.cornerGuides.listByGuide(guideId)).map((g) => g.notes).sort();
  expect(notes).toEqual(["", "Bumpy"]);

  // A backup round-trip keeps them.
  const backup = await repos.backup.exportAll();
  await repos.backup.importAll(backup, "replace");
  const restored = (await repos.cornerGuides.listByGuide(guideId)).map((g) => g.notes).sort();
  expect(restored).toEqual(["", "Bumpy"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @track-day/schema test && pnpm --filter web test src/data/local/import-services.test.ts`
Expected: FAIL — `notes` missing from parsed CornerGuide; payload strips `notes`.

- [ ] **Step 3: Implement**

`packages/schema/src/entities.ts`, after the `downshiftTo` field:

```ts
  /** Free text for this car at this corner (edited in the app, or quick notes from practice). */
  notes: z.string().default(""),
```

`packages/schema/src/payloads.ts`, in the GuideImportPayload corner object after `downshiftTo`:

```ts
      notes: opt(z.string()),
```

`apps/web/src/data/local/import-services.ts`, in the `cornerGuides.create({...})` call after `downshiftTo`:

```ts
          notes: c.notes ?? "",
```

- [ ] **Step 4: Regenerate the JSON Schema and run everything**

Run: `pnpm --filter @track-day/schema json-schema && pnpm --filter @track-day/schema test && pnpm --filter web test src/data && pnpm typecheck`
Expected: PASS. `git diff packages/schema/json-schema` shows only a `notes` property added to guide corners. If `typecheck` reports another `cornerGuides.create` call missing `notes`, add `notes: ""` there.

- [ ] **Step 5: Commit**

```bash
git add packages/schema apps/web/src/data/local
git commit -m "feat(schema): add free-text notes to corner guides

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Map point → path position, and lap-order checks

**Files:**

- Create: `apps/web/src/features/track-view/geometry/nearest.ts`
- Test: `apps/web/src/features/track-view/geometry/nearest.test.ts`

**Interfaces:**

- Consumes: `TrackPath` from `./path`, `Point` from `./types`.
- Produces:
  - `nearestFraction(path: TrackPath, p: Point): number` — fraction in [0, 1).
  - `lapDelta(from: number, to: number): number` — signed shortest distance in fractions, in (−0.5, 0.5].
  - `type LinePoint = "turnIn" | "apex" | "exit"`
  - `type LinePositions = { turnIn: number | null; apex: number | null; exit: number | null }`
  - `checkLineOrder(p: LinePositions): boolean` — true when every pair that is set runs turn-in → apex → exit.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTrackPath } from "./path";
import { checkLineOrder, lapDelta, nearestFraction } from "./nearest";

const SQUARE = createTrackPath("M 0 0 L 100 0 L 100 100 L 0 100 Z");

describe("nearestFraction", () => {
  it("snaps a point near the outline to its position along the lap", () => {
    expect(nearestFraction(SQUARE, { x: 50, y: -8 })).toBeCloseTo(0.125, 3);
    expect(nearestFraction(SQUARE, { x: 108, y: 50 })).toBeCloseTo(0.375, 3);
  });

  it("stays below 1 near the start", () => {
    const f = nearestFraction(SQUARE, { x: -3, y: 1 });
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(1);
    expect(Math.min(f, 1 - f)).toBeLessThan(0.01);
  });
});

describe("lapDelta", () => {
  it("is the signed shortest way round", () => {
    expect(lapDelta(0.2, 0.3)).toBeCloseTo(0.1);
    expect(lapDelta(0.3, 0.2)).toBeCloseTo(-0.1);
    expect(lapDelta(0.98, 0.01)).toBeCloseTo(0.03);
    expect(lapDelta(0.01, 0.98)).toBeCloseTo(-0.03);
  });
});

describe("checkLineOrder", () => {
  it("accepts turn-in, apex, exit in lap order, including across the start", () => {
    expect(checkLineOrder({ turnIn: 0.1, apex: 0.12, exit: 0.14 })).toBe(true);
    expect(checkLineOrder({ turnIn: 0.98, apex: 0.005, exit: 0.02 })).toBe(true);
  });

  it("refuses points out of order", () => {
    expect(checkLineOrder({ turnIn: 0.13, apex: 0.12, exit: null })).toBe(false);
    expect(checkLineOrder({ turnIn: null, apex: 0.12, exit: 0.11 })).toBe(false);
    expect(checkLineOrder({ turnIn: 0.2, apex: null, exit: 0.1 })).toBe(false);
  });

  it("accepts any single point and an empty line", () => {
    expect(checkLineOrder({ turnIn: 0.5, apex: null, exit: null })).toBe(true);
    expect(checkLineOrder({ turnIn: null, apex: null, exit: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/geometry/nearest.test.ts`
Expected: FAIL — cannot find module `./nearest`.

- [ ] **Step 3: Implement**

```ts
import type { TrackPath } from "./path";
import type { Point } from "./types";

const COARSE = 1000;
const REFINE = 40;
const wrap = (f: number) => ((f % 1) + 1) % 1;
const dist2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Position along the lap (0–1) of the outline point closest to `p` (path coordinates). */
export function nearestFraction(path: TrackPath, p: Point): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < COARSE; i++) {
    const d = dist2(path.pointAt(i / COARSE), p);
    if (d < bestDist) {
      bestDist = d;
      best = i / COARSE;
    }
  }
  // Refine within one coarse step either side.
  const step = 1 / COARSE;
  let refined = best;
  for (let i = -REFINE; i <= REFINE; i++) {
    const f = best + (step * i) / REFINE;
    const d = dist2(path.pointAt(f), p);
    if (d < bestDist) {
      bestDist = d;
      refined = f;
    }
  }
  const f = wrap(refined);
  return f >= 1 ? 0 : f;
}

/** Signed shortest distance from `from` to `to` around the lap, in fractions (−0.5, 0.5]. */
export function lapDelta(from: number, to: number): number {
  const d = wrap(to - from);
  return d > 0.5 ? d - 1 : d;
}

export type LinePoint = "turnIn" | "apex" | "exit";
export type LinePositions = Record<LinePoint, number | null>;

const ORDER: LinePoint[] = ["turnIn", "apex", "exit"];

/** True when every pair of set points runs turn-in → apex → exit in the driving direction. */
export function checkLineOrder(p: LinePositions): boolean {
  const set = ORDER.filter((k) => p[k] !== null);
  for (let i = 0; i < set.length - 1; i++) {
    if (lapDelta(p[set[i]!]!, p[set[i + 1]!]!) <= 0) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/track-view/geometry/nearest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/track-view/geometry/nearest.ts apps/web/src/features/track-view/geometry/nearest.test.ts
git commit -m "feat(web): snap map points to the outline and check line order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Generated racing line (`cornerLine`)

**Files:**

- Create: `apps/web/src/features/track-view/geometry/corner-line.ts`
- Test: `apps/web/src/features/track-view/geometry/corner-line.test.ts`

**Interfaces:**

- Consumes: `TrackPath`, `Point`, `lapDelta` (Task 2).
- Produces:
  - `LINE_OFFSET_M = 6`
  - `interface CornerLineCorner { direction: "left" | "right" | null; turnIn: number | null; apex: number | null; exit: number | null }`
  - `cornerLine(input: { path: TrackPath; lengthMeters: number; corners: CornerLineCorner[] }): { points: Point[]; estimated: boolean } | null` — points in path coordinates, in driving order.
  - `catmullRom(points: Point[], samplesPerSegment?: number): Point[]`
  - `pointsToPath(points: Point[]): string` — `"M x y L x y …"`.

`unitsPerMeter` is derived inside as `path.length / lengthMeters`.

- [ ] **Step 1: Write the failing test**

The test track is a 1000-unit square driven clockwise on screen (y down) with `lengthMeters: 1000`, so 1 unit = 1 m. Along the top edge (fraction 0–0.25) the driving direction is +x, so the right-hand side is +y (inside the square) and the left-hand side is −y.

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTrackPath } from "./path";
import { catmullRom, cornerLine, pointsToPath } from "./corner-line";

const SQUARE = createTrackPath("M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z"); // 4000 units
const LEN = 4000; // 1 unit = 1 m

const at = (meters: number) => meters / LEN;

describe("cornerLine", () => {
  it("puts turn-in and exit outside and the apex inside, for a right-hander", () => {
    // Right-hander on the top straight: inside is +y (right), outside is −y.
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [{ direction: "right", turnIn: at(400), apex: at(500), exit: at(600) }],
    })!;
    expect(line.estimated).toBe(false);
    const nearX = (x: number) =>
      line.points.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
    expect(nearX(400).y).toBeCloseTo(-6, 0);
    expect(nearX(500).y).toBeCloseTo(6, 0);
    expect(nearX(600).y).toBeCloseTo(-6, 0);
    // Lead-in and lead-out 40 m outside the turn-in and exit.
    expect(line.points[0]).toMatchObject({ x: expect.closeTo(360, 0), y: expect.closeTo(-6, 0) });
    expect(line.points.at(-1)).toMatchObject({
      x: expect.closeTo(640, 0),
      y: expect.closeTo(-6, 0),
    });
  });

  it("mirrors the sides for a left-hander", () => {
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [{ direction: "left", turnIn: at(400), apex: at(500), exit: at(600) }],
    })!;
    const apex = line.points.reduce((a, b) => (Math.abs(b.x - 500) < Math.abs(a.x - 500) ? b : a));
    expect(apex.y).toBeCloseTo(-6, 0);
  });

  it("estimates turn-in and exit from the apex alone", () => {
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [{ direction: "right", turnIn: null, apex: at(500), exit: null }],
    })!;
    expect(line.estimated).toBe(true);
    // Lead-in = 60 m (estimated turn-in) + 40 m before the apex.
    expect(line.points[0]!.x).toBeCloseTo(400, 0);
    expect(line.points.at(-1)!.x).toBeCloseTo(590, 0);
  });

  it("returns null without an apex or a direction", () => {
    expect(
      cornerLine({
        path: SQUARE,
        lengthMeters: LEN,
        corners: [{ direction: "right", turnIn: at(400), apex: null, exit: at(600) }],
      }),
    ).toBeNull();
    expect(
      cornerLine({
        path: SQUARE,
        lengthMeters: LEN,
        corners: [{ direction: null, turnIn: null, apex: at(500), exit: null }],
      }),
    ).toBeNull();
  });

  it("follows a corner across the start/finish line without crossing the lap", () => {
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [{ direction: "right", turnIn: at(3950), apex: at(10), exit: at(80) }],
    })!;
    // Every point stays near the start corner (0, 0).
    for (const p of line.points) expect(Math.hypot(p.x, p.y)).toBeLessThan(200);
  });

  it("joins the corners of a complex in lap order", () => {
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [
        { direction: "left", turnIn: at(300), apex: at(350), exit: at(400) },
        { direction: "right", turnIn: at(450), apex: at(500), exit: at(550) },
      ],
    })!;
    const xs = line.points.map((p) => p.x);
    expect(xs[0]).toBeCloseTo(260, 0);
    expect(xs.at(-1)).toBeCloseTo(590, 0);
    // Monotonic along the straight.
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]! - 1e-6);
  });
});

describe("catmullRom", () => {
  it("passes through every control point", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ];
    const curve = catmullRom(pts, 8);
    for (const p of pts) {
      expect(curve.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)).toBe(true);
    }
  });
});

describe("pointsToPath", () => {
  it("writes an SVG polyline", () => {
    expect(
      pointsToPath([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBe("M1 2 L3 4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/geometry/corner-line.test.ts`
Expected: FAIL — cannot find module `./corner-line`.

- [ ] **Step 3: Implement**

```ts
import { lapDelta } from "./nearest";
import type { TrackPath } from "./path";
import type { Point } from "./types";

/** Half of the nominal 12 m track width (ADR-007). */
export const LINE_OFFSET_M = 6;
const LEAD_M = 40;
const EST_TURN_IN_M = 60;
const EST_EXIT_M = 50;

export interface CornerLineCorner {
  direction: "left" | "right" | null;
  turnIn: number | null;
  apex: number | null;
  exit: number | null;
}

/**
 * A racing line through one corner (or a complex, in lap order): turn-in and
 * exit on the outside edge, apex on the inside, with a short lead-in and
 * lead-out on the outside, smoothed. Points are in path coordinates.
 * `null` when a corner has no apex or no direction.
 */
export function cornerLine({
  path,
  lengthMeters,
  corners,
}: {
  path: TrackPath;
  lengthMeters: number;
  corners: CornerLineCorner[];
}): { points: Point[]; estimated: boolean } | null {
  if (corners.length === 0) return null;
  const unitsPerMeter = path.length / lengthMeters;
  const m = (meters: number) => meters / lengthMeters;
  const offset = LINE_OFFSET_M * unitsPerMeter;

  // Outside of a right-hander is the left-hand side, and vice versa.
  // Right-hand normal of tangent (tx, ty) in y-down coordinates is (−ty, tx).
  const sideAt = (f: number, side: "left" | "right") => {
    const p = path.pointAt(f);
    const t = path.tangentAt(f);
    const s = side === "right" ? 1 : -1;
    return { x: p.x - t.y * offset * s, y: p.y + t.x * offset * s };
  };
  const opposite = (d: "left" | "right") => (d === "left" ? "right" : "left");

  // Unwrapped fractions, relative to the first apex, so a line can cross start/finish.
  const origin = corners[0]!.apex;
  if (origin === null) return null;
  const unwrap = (f: number) => origin + lapDelta(origin, f);

  let estimated = false;
  const controls: Point[] = [];
  let first: { f: number; side: "left" | "right" } | null = null;
  let last: { f: number; side: "left" | "right" } | null = null;

  for (const c of corners) {
    if (c.apex === null || c.direction === null) return null;
    const apex = unwrap(c.apex);
    const turnIn = c.turnIn !== null ? unwrap(c.turnIn) : apex - m(EST_TURN_IN_M);
    const exit = c.exit !== null ? unwrap(c.exit) : apex + m(EST_EXIT_M);
    if (c.turnIn === null || c.exit === null) estimated = true;
    const outside = opposite(c.direction);
    first ??= { f: turnIn, side: outside };
    last = { f: exit, side: outside };
    controls.push(sideAt(turnIn, outside), sideAt(apex, c.direction), sideAt(exit, outside));
  }

  const points = [
    sideAt(first!.f - m(LEAD_M), first!.side),
    ...controls,
    sideAt(last!.f + m(LEAD_M), last!.side),
  ];
  return { points: catmullRom(points), estimated };
}

const knot = (a: Point, b: Point) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-6);
function lerp(a: Point, b: Point, ta: number, tb: number, t: number): Point {
  const u = (t - ta) / (tb - ta);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** Centripetal Catmull-Rom through every point (Barry–Goldman), endpoints included. */
export function catmullRom(points: Point[], samplesPerSegment = 12): Point[] {
  if (points.length < 3) return points.slice();
  const n = points.length;
  // Phantom endpoints, mirrored, so the curve starts and ends on the real ones.
  const p = [
    { x: 2 * points[0]!.x - points[1]!.x, y: 2 * points[0]!.y - points[1]!.y },
    ...points,
    { x: 2 * points[n - 1]!.x - points[n - 2]!.x, y: 2 * points[n - 1]!.y - points[n - 2]!.y },
  ];
  const out: Point[] = [points[0]!];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1]!, p[i]!, p[i + 1]!, p[i + 2]!];
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let s = 1; s <= samplesPerSegment; s++) {
      const t = t1 + ((t2 - t1) * s) / samplesPerSegment;
      const a1 = lerp(p0, p1, t0, t1, t);
      const a2 = lerp(p1, p2, t1, t2, t);
      const a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t);
      const b2 = lerp(a2, a3, t1, t3, t);
      out.push(s === samplesPerSegment ? p2 : lerp(b1, b2, t1, t2, t));
    }
  }
  return out;
}

export function pointsToPath(points: Point[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/track-view/geometry/corner-line.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/track-view/geometry/corner-line.ts apps/web/src/features/track-view/geometry/corner-line.test.ts
git commit -m "feat(web): generate a corner's racing line from turn-in, apex and exit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Draft helpers and edit mutations

**Files:**

- Create: `apps/web/src/features/track-view/edit/corner-guide-draft.ts`
- Create: `apps/web/src/features/track-view/edit/use-edit-mutations.ts`
- Test: `apps/web/src/features/track-view/edit/corner-guide-draft.test.ts`, `apps/web/src/features/track-view/edit/use-edit-mutations.test.tsx`

**Interfaces:**

- Consumes: `Repositories`, `NewEntity`, `EntityPatch` from `@/data/repositories`; `queryKeys`; `CornerGuide`, `CUE_MAX_LENGTH` from `@track-day/schema`.
- Produces (`corner-guide-draft.ts`):
  - `emptyCornerGuide(guideId: string, cornerId: string): NewEntity<CornerGuide>`
  - `type GuideDraft` — all editable fields as strings (see code).
  - `GUIDE_FIELDS: readonly (keyof GuideDraft)[]`
  - `draftFrom(guide: CornerGuide | undefined): GuideDraft`
  - `parseDraft(draft: GuideDraft): { ok: true; patch: GuidePatch } | { ok: false; errors: Partial<Record<keyof GuideDraft, string>> }`
  - `type GuidePatch = EntityPatch<CornerGuide>`
  - `asManual(existing: Pick<CornerGuide, "source" | "confidence">, patch: GuidePatch): GuidePatch`
  - `appendNote(notes: string, text: string, date: Date): string`
- Produces (`use-edit-mutations.ts`):
  - `useSaveCorner(trackId: string)` → mutation `{ id: string; patch: { notes: string; commonMistakes: string[] } }`
  - `useSaveCornerGuide()` → mutation `{ guideId: string; cornerId: string; existing: CornerGuide | undefined; patch: GuidePatch }` returning `CornerGuide`
  - `useAppendNote(trackId: string)` → mutation `{ text: string; corner: Corner; guideId: string | null; existing: CornerGuide | undefined }`

- [ ] **Step 1: Write the failing test for the pure helpers**

`corner-guide-draft.test.ts`:

```ts
// @vitest-environment node
import type { CornerGuide } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import {
  appendNote,
  asManual,
  draftFrom,
  emptyCornerGuide,
  parseDraft,
} from "./corner-guide-draft";

const base = { ...emptyCornerGuide("g1", "c1") } as unknown as CornerGuide;

describe("draftFrom / parseDraft", () => {
  it("round-trips values, and empty fields become null", () => {
    const draft = draftFrom({ ...base, minSpeedKmh: 72.5, gear: 3, cue: "Late apex", notes: "x" });
    expect(draft.minSpeedKmh).toBe("72.5");
    expect(draft.entrySpeedKmh).toBe("");
    const result = parseDraft(draft);
    expect(result).toEqual({
      ok: true,
      patch: expect.objectContaining({
        minSpeedKmh: 72.5,
        gear: 3,
        entrySpeedKmh: null,
        cue: "Late apex",
        notes: "x",
        brakePressure: null,
      }),
    });
  });

  it("reports field errors with the schema's limits", () => {
    const draft = { ...draftFrom(base), gear: "11", minSpeedKmh: "fast", brakePressurePct: "120" };
    const result = parseDraft(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "brakePressurePct",
        "gear",
        "minSpeedKmh",
      ]);
      expect(result.errors.minSpeedKmh).toBe("Enter a number");
    }
  });

  it("refuses a cue over 160 characters", () => {
    const result = parseDraft({ ...draftFrom(base), cue: "x".repeat(161) });
    expect(result.ok).toBe(false);
  });

  it("treats a blank cue as no cue", () => {
    const result = parseDraft({ ...draftFrom(base), cue: "   " });
    expect(result).toMatchObject({ ok: true, patch: { cue: null } });
  });
});

describe("asManual", () => {
  it("turns AI values into manual ones and drops the confidence", () => {
    expect(asManual({ source: "ai", confidence: "low" }, { gear: 2 })).toEqual({
      gear: 2,
      source: "manual",
      confidence: null,
    });
  });

  it("leaves manual and telemetry guides alone", () => {
    expect(asManual({ source: "telemetry", confidence: "high" }, { gear: 2 })).toEqual({ gear: 2 });
  });
});

describe("appendNote", () => {
  const day = new Date(2026, 9, 7, 23, 30); // local time, 7 Oct
  it("adds a dated line", () => {
    expect(appendNote("", "Braked too late", day)).toBe("2026-10-07: Braked too late");
    expect(appendNote("Old note", "  Try 100 board ", day)).toBe(
      "Old note\n2026-10-07: Try 100 board",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/edit/corner-guide-draft.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `corner-guide-draft.ts`**

```ts
import { BrakePressure, CornerGuide, type CornerGuide as CornerGuideT } from "@track-day/schema";
import type { EntityPatch, NewEntity } from "@/data/repositories";

export type GuidePatch = EntityPatch<CornerGuideT>;

/** A corner guide with nothing known yet, entered by hand. */
export function emptyCornerGuide(guideId: string, cornerId: string): NewEntity<CornerGuideT> {
  return {
    guideId,
    cornerId,
    brakeReference: null,
    brakeMarkerMeters: null,
    entrySpeedKmh: null,
    minSpeedKmh: null,
    exitSpeedKmh: null,
    gear: null,
    line: { turnIn: null, apex: null, exit: null, turnInAt: null, apexAt: null, exitAt: null },
    throttleNotes: "",
    trailBrakeNotes: "",
    priority: null,
    brakePressure: null,
    brakePressurePct: null,
    cue: null,
    downshiftTo: null,
    notes: "",
    source: "manual",
    confidence: null,
  };
}

const NUMBER_FIELDS = [
  "entrySpeedKmh",
  "minSpeedKmh",
  "exitSpeedKmh",
  "gear",
  "downshiftTo",
  "brakeMarkerMeters",
  "brakePressurePct",
] as const;
const TEXT_FIELDS = ["brakeReference", "cue"] as const; // "" → null
const NOTE_FIELDS = ["throttleNotes", "trailBrakeNotes", "notes"] as const; // kept as strings

export type GuideDraft = Record<
  | (typeof NUMBER_FIELDS)[number]
  | (typeof TEXT_FIELDS)[number]
  | (typeof NOTE_FIELDS)[number]
  | "brakePressure",
  string
>;

export const GUIDE_FIELDS = [
  ...NUMBER_FIELDS,
  ...TEXT_FIELDS,
  ...NOTE_FIELDS,
  "brakePressure",
] as const satisfies readonly (keyof GuideDraft)[];

export function draftFrom(guide: CornerGuideT | undefined): GuideDraft {
  const draft = {} as GuideDraft;
  for (const f of NUMBER_FIELDS) draft[f] = guide?.[f] == null ? "" : String(guide[f]);
  for (const f of TEXT_FIELDS) draft[f] = guide?.[f] ?? "";
  for (const f of NOTE_FIELDS) draft[f] = guide?.[f] ?? "";
  draft.brakePressure = guide?.brakePressure ?? "";
  return draft;
}

const Editable = CornerGuide.pick({
  entrySpeedKmh: true,
  minSpeedKmh: true,
  exitSpeedKmh: true,
  gear: true,
  downshiftTo: true,
  brakeMarkerMeters: true,
  brakePressurePct: true,
  brakeReference: true,
  cue: true,
  throttleNotes: true,
  trailBrakeNotes: true,
  notes: true,
  brakePressure: true,
});

export type DraftResult =
  | { ok: true; patch: GuidePatch }
  | { ok: false; errors: Partial<Record<keyof GuideDraft, string>> };

/** Form strings → a validated patch, with one message per bad field. */
export function parseDraft(draft: GuideDraft): DraftResult {
  const errors: Partial<Record<keyof GuideDraft, string>> = {};
  const raw: Record<string, unknown> = {};
  for (const f of NUMBER_FIELDS) {
    const v = draft[f].trim();
    if (v === "") raw[f] = null;
    else if (Number.isNaN(Number(v))) errors[f] = "Enter a number";
    else raw[f] = Number(v);
  }
  for (const f of TEXT_FIELDS) raw[f] = draft[f].trim() === "" ? null : draft[f].trim();
  for (const f of NOTE_FIELDS) raw[f] = draft[f];
  raw.brakePressure = draft.brakePressure === "" ? null : BrakePressure.parse(draft.brakePressure);

  const parsed = Editable.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof GuideDraft;
      errors[field] ??= issue.message;
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, patch: parsed.data };
}

/** Editing an AI estimate makes it the user's own value. */
export function asManual(
  existing: Pick<CornerGuideT, "source" | "confidence">,
  patch: GuidePatch,
): GuidePatch {
  return existing.source === "ai" ? { ...patch, source: "manual", confidence: null } : patch;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Appends `YYYY-MM-DD: text` (local date) on its own line. */
export function appendNote(notes: string, text: string, date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const line = `${day}: ${text.trim()}`;
  return notes.trim() === "" ? line : `${notes.replace(/\s+$/, "")}\n${line}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/track-view/edit/corner-guide-draft.test.ts`
Expected: PASS. If Zod's message for a gear of 11 differs, that is fine — the test only checks which fields have errors.

- [ ] **Step 5: Write the failing mutation test**

`use-edit-mutations.test.tsx` uses real IndexedDB repositories (fake-indexeddb) so writes are checked end to end:

```tsx
import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload } from "@track-day/schema";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { useAppendNote, useSaveCorner, useSaveCornerGuide } from "./use-edit-mutations";

let db: TrackDayDb;
let repos: Repositories;
beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});
afterEach(() => db.delete());

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <RepositoriesProvider repositories={repos}>{children}</RepositoriesProvider>
  </QueryClientProvider>
);

async function seed() {
  const { trackId, layoutId } = await repos.trackImport.importTrack(
    TrackImportPayload.parse(interlagos),
  );
  const corner = (await repos.corners.listByLayout(layoutId))[0]!;
  const classId = (
    await repos.carClasses.create({
      name: "GT3",
      description: "",
      drivetrain: null,
      downforce: null,
    })
  ).id;
  const guide = await repos.guides.create({
    layoutId,
    target: { carClassId: classId },
    sim: null,
    referenceLapTime: null,
    setupNotes: "",
    source: "manual",
  });
  return { trackId, corner, guideId: guide.id };
}

describe("edit mutations", () => {
  it("saves corner notes and mistakes", async () => {
    const { trackId, corner } = await seed();
    const { result } = renderHook(() => useSaveCorner(trackId), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        id: corner.id,
        patch: { notes: "Bumpy", commonMistakes: ["Early apex"] },
      }),
    );
    expect(await repos.corners.get(corner.id)).toMatchObject({
      notes: "Bumpy",
      commonMistakes: ["Early apex"],
    });
  });

  it("creates a corner guide on first save, then updates it", async () => {
    const { corner, guideId } = await seed();
    const { result } = renderHook(() => useSaveCornerGuide(), { wrapper });
    const created = await act(() =>
      result.current.mutateAsync({
        guideId,
        cornerId: corner.id,
        existing: undefined,
        patch: { gear: 2 },
      }),
    );
    expect(created).toMatchObject({ gear: 2, source: "manual", notes: "" });
    await act(() =>
      result.current.mutateAsync({
        guideId,
        cornerId: corner.id,
        existing: created,
        patch: { gear: 3 },
      }),
    );
    const all = await repos.cornerGuides.listByGuide(guideId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ gear: 3 });
  });

  it("marks an edited AI value as manual", async () => {
    const { corner, guideId } = await seed();
    const ai = await repos.cornerGuides.create({
      ...(await import("./corner-guide-draft")).emptyCornerGuide(guideId, corner.id),
      source: "ai",
      confidence: "low",
    });
    const { result } = renderHook(() => useSaveCornerGuide(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        guideId,
        cornerId: corner.id,
        existing: ai,
        patch: { gear: 4 },
      }),
    );
    expect(await repos.cornerGuides.get(ai.id)).toMatchObject({
      gear: 4,
      source: "manual",
      confidence: null,
    });
  });

  it("appends a quick note to the car, or to the corner without a car", async () => {
    const { trackId, corner, guideId } = await seed();
    const { result } = renderHook(() => useAppendNote(trackId), { wrapper });
    await act(() =>
      result.current.mutateAsync({ text: "Late", corner, guideId, existing: undefined }),
    );
    const [cg] = await repos.cornerGuides.listByGuide(guideId);
    expect(cg!.notes).toMatch(/^\d{4}-\d{2}-\d{2}: Late$/);

    await act(() =>
      result.current.mutateAsync({ text: "Kerb", corner, guideId: null, existing: undefined }),
    );
    expect((await repos.corners.get(corner.id))!.notes).toMatch(/\d{4}-\d{2}-\d{2}: Kerb$/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/edit/use-edit-mutations.test.tsx`
Expected: FAIL — module `./use-edit-mutations` not found.

- [ ] **Step 7: Implement `use-edit-mutations.ts`**

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Corner, CornerGuide } from "@track-day/schema";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import { appendNote, asManual, emptyCornerGuide, type GuidePatch } from "./corner-guide-draft";

/** Corner notes and common mistakes (any car). */
export function useSaveCorner(trackId: string) {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { notes: string; commonMistakes: string[] };
    }) => repos.corners.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.track(trackId) }),
  });
}

interface SaveGuideInput {
  guideId: string;
  cornerId: string;
  existing: CornerGuide | undefined;
  patch: GuidePatch;
}

/** One car's values for one corner; creates the record on first save. */
export function useSaveCornerGuide() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guideId, cornerId, existing, patch }: SaveGuideInput) =>
      existing
        ? repos.cornerGuides.update(existing.id, asManual(existing, patch))
        : repos.cornerGuides.create({ ...emptyCornerGuide(guideId, cornerId), ...patch }),
    onSuccess: (_saved, { guideId }) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.cornerGuides(guideId) }),
  });
}

interface AppendNoteInput {
  text: string;
  corner: Corner;
  /** The car's guide; null appends to the corner notes instead. */
  guideId: string | null;
  existing: CornerGuide | undefined;
}

/** Quick note from practice: a dated line on the car's notes (or the corner's). */
export function useAppendNote(trackId: string) {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, corner, guideId, existing }: AppendNoteInput) => {
      const now = new Date();
      if (guideId === null) {
        await repos.corners.update(corner.id, { notes: appendNote(corner.notes, text, now) });
        return;
      }
      if (existing) {
        await repos.cornerGuides.update(existing.id, {
          notes: appendNote(existing.notes, text, now),
        });
      } else {
        await repos.cornerGuides.create({
          ...emptyCornerGuide(guideId, corner.id),
          notes: appendNote("", text, now),
        });
      }
    },
    onSuccess: (_r, { guideId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.track(trackId) }),
        guideId && queryClient.invalidateQueries({ queryKey: queryKeys.cornerGuides(guideId) }),
      ]),
  });
}
```

A quick note is not a value edit, so it does not flip an AI guide to manual.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter web test src/features/track-view/edit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/track-view/edit
git commit -m "feat(web): add draft helpers and mutations for editing corners and guides

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Corner notes form

**Files:**

- Create: `apps/web/src/features/track-view/edit/corner-notes-form.tsx`
- Test: `apps/web/src/features/track-view/edit/corner-notes-form.test.tsx`

**Interfaces:**

- Consumes: `useSaveCorner(trackId)` (Task 4); `Button`, `Label`, `Textarea`, `Input` from `@/shared/ui`.
- Produces: `CornerNotesForm({ trackId, corner, onDirtyChange }: { trackId: string; corner: Corner; onDirtyChange(dirty: boolean): void })`.

The form is keyed by corner id by its parent, so it resets when the corner changes.

- [ ] **Step 1: Write the failing test**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { CornerNotesForm } from "./corner-notes-form";

const corner = { id: "c1", notes: "Bumpy", commonMistakes: ["Early apex"] } as Corner;

function setup(update = vi.fn().mockResolvedValue(corner)) {
  const onDirtyChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{ corners: { update } } as unknown as Repositories}>
        <CornerNotesForm trackId="t1" corner={corner} onDirtyChange={onDirtyChange} />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { update, onDirtyChange, user: userEvent.setup() };
}

describe("CornerNotesForm", () => {
  it("saves notes and the edited list of mistakes", async () => {
    const { update, onDirtyChange, user } = setup();
    await user.type(screen.getByLabelText("Corner notes"), " on entry");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Add mistake" }));
    await user.type(screen.getByLabelText("Mistake 2"), "Too much kerb");
    await user.click(screen.getByRole("button", { name: "Remove mistake 1" }));
    await user.click(screen.getByRole("button", { name: "Save corner notes" }));

    expect(update).toHaveBeenCalledWith("c1", {
      notes: "Bumpy on entry",
      commonMistakes: ["Too much kerb"],
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("drops empty mistakes and cancels back to the stored values", async () => {
    const { update, user } = setup();
    await user.click(screen.getByRole("button", { name: "Add mistake" }));
    await user.click(screen.getByRole("button", { name: "Save corner notes" }));
    expect(update).toHaveBeenCalledWith("c1", { notes: "Bumpy", commonMistakes: ["Early apex"] });

    await user.clear(screen.getByLabelText("Corner notes"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Corner notes")).toHaveValue("Bumpy");
  });

  it("keeps the input and offers retry when saving fails", async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error("QuotaExceededError")));
    await user.type(screen.getByLabelText("Corner notes"), "!");
    await user.click(screen.getByRole("button", { name: "Save corner notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save: QuotaExceededError",
    );
    expect(screen.getByLabelText("Corner notes")).toHaveValue("Bumpy!");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/edit/corner-notes-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

The form compares against the last saved values (not the prop), so it reports clean right after a save, before the refetched corner arrives. The parent keys it by corner id, so it resets on corner change.

```tsx
"use client";

import type { Corner } from "@track-day/schema";
import { useEffect, useId, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useSaveCorner } from "./use-edit-mutations";

/** Notes that hold for any car. */
export function CornerNotesForm({
  trackId,
  corner,
  onDirtyChange,
}: {
  trackId: string;
  corner: Corner;
  onDirtyChange(dirty: boolean): void;
}) {
  const [saved, setSaved] = useState({
    notes: corner.notes,
    commonMistakes: corner.commonMistakes,
  });
  const [notes, setNotes] = useState(saved.notes);
  const [mistakes, setMistakes] = useState(saved.commonMistakes);
  const save = useSaveCorner(trackId);
  const id = useId();

  const dirty =
    notes !== saved.notes || JSON.stringify(mistakes) !== JSON.stringify(saved.commonMistakes);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function reset() {
    setNotes(saved.notes);
    setMistakes(saved.commonMistakes);
    save.reset();
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="Corner notes (all cars)"
      onSubmit={(e) => {
        e.preventDefault();
        const commonMistakes = mistakes.map((m) => m.trim()).filter(Boolean);
        save.mutate(
          { id: corner.id, patch: { notes, commonMistakes } },
          {
            onSuccess: () => {
              setMistakes(commonMistakes);
              setSaved({ notes, commonMistakes });
            },
          },
        );
      }}
    >
      <h3 className="font-medium">Corner notes (all cars)</h3>
      <div className="space-y-1">
        <Label htmlFor={`${id}-notes`}>Corner notes</Label>
        <Textarea
          id={`${id}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-24"
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Common mistakes</legend>
        {mistakes.map((m, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={`Mistake ${i + 1}`}
              value={m}
              onChange={(e) => setMistakes(mistakes.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <Button
              variant="outline"
              aria-label={`Remove mistake ${i + 1}`}
              onClick={() => setMistakes(mistakes.filter((_, j) => j !== i))}
            >
              ×
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setMistakes([...mistakes, ""])}>
          Add mistake
        </Button>
      </fieldset>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending} aria-label="Save corner notes">
          {save.error ? "Retry" : "Save"}
        </Button>
        <Button variant="outline" onClick={reset} disabled={save.isPending}>
          Cancel
        </Button>
        <p aria-live="polite" className="text-sm text-muted">
          {save.isSuccess && !dirty && "Saved"}
        </p>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/track-view/edit/corner-notes-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/track-view/edit/corner-notes-form.tsx apps/web/src/features/track-view/edit/corner-notes-form.test.tsx
git commit -m "feat(web): edit a corner's notes and common mistakes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Car values form (corner guide)

**Files:**

- Create: `apps/web/src/features/track-view/edit/corner-guide-form.tsx`
- Test: `apps/web/src/features/track-view/edit/corner-guide-form.test.tsx`

**Interfaces:**

- Consumes: `draftFrom`, `parseDraft`, `GuideDraft` (Task 4); `useSaveCornerGuide()` (Task 4); `CUE_MAX_LENGTH`, `BrakePressure` from `@track-day/schema`.
- Produces: `CornerGuideForm({ guideId, cornerId, label, guide, onDirtyChange, children }: { guideId: string; cornerId: string; label: string; guide: CornerGuide | undefined; onDirtyChange(dirty: boolean): void; children?: ReactNode })`. `children` is rendered inside the card under the heading (Task 8 puts the line-point controls there).

- [ ] **Step 1: Write the failing test**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CornerGuide } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { emptyCornerGuide } from "./corner-guide-draft";
import { CornerGuideForm } from "./corner-guide-form";

function setup(guide?: CornerGuide) {
  const create = vi.fn().mockImplementation(async (v) => ({ id: "cg1", ...v }));
  const update = vi.fn().mockImplementation(async (id, patch) => ({ ...guide, id, ...patch }));
  const onDirtyChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider
        repositories={{ cornerGuides: { create, update } } as unknown as Repositories}
      >
        <CornerGuideForm
          guideId="g1"
          cornerId="c1"
          label="MX-5 · T1"
          guide={guide}
          onDirtyChange={onDirtyChange}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { create, update, onDirtyChange, user: userEvent.setup() };
}

describe("CornerGuideForm", () => {
  it("creates the corner guide on first save", async () => {
    const { create, user } = setup();
    await user.type(screen.getByLabelText("Minimum speed (km/h)"), "72");
    await user.type(screen.getByLabelText("Gear"), "3");
    await user.selectOptions(screen.getByLabelText("Brake pressure"), "firm");
    await user.type(screen.getByLabelText("Car notes"), "Brake earlier than the AI says");
    await user.click(screen.getByRole("button", { name: "Save car values" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        guideId: "g1",
        cornerId: "c1",
        minSpeedKmh: 72,
        gear: 3,
        brakePressure: "firm",
        notes: "Brake earlier than the AI says",
        source: "manual",
      }),
    );
  });

  it("updates an AI guide and marks it manual", async () => {
    const ai = {
      ...emptyCornerGuide("g1", "c1"),
      id: "cg1",
      gear: 2,
      source: "ai",
      confidence: "low",
    } as CornerGuide;
    const { update, user } = setup(ai);
    expect(screen.getByLabelText("Gear")).toHaveValue("2");
    await user.clear(screen.getByLabelText("Gear"));
    await user.type(screen.getByLabelText("Gear"), "3");
    await user.click(screen.getByRole("button", { name: "Save car values" }));
    expect(update).toHaveBeenCalledWith(
      "cg1",
      expect.objectContaining({ gear: 3, source: "manual", confidence: null }),
    );
  });

  it("shows errors next to the fields and saves nothing", async () => {
    const { create, user } = setup();
    await user.type(screen.getByLabelText("Gear"), "12");
    await user.type(screen.getByLabelText("Minimum speed (km/h)"), "abc");
    await user.click(screen.getByRole("button", { name: "Save car values" }));
    expect(screen.getByLabelText("Gear")).toHaveAccessibleDescription(/.+/);
    expect(screen.getByLabelText("Minimum speed (km/h)")).toHaveAccessibleDescription(
      "Enter a number",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("counts the cue against its limit", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Cue"), "Late apex");
    expect(screen.getByText("9/160")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/edit/corner-guide-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { BrakePressure, CUE_MAX_LENGTH, type CornerGuide } from "@track-day/schema";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { draftFrom, parseDraft, type GuideDraft } from "./corner-guide-draft";
import { useSaveCornerGuide } from "./use-edit-mutations";

type Errors = Partial<Record<keyof GuideDraft, string>>;

/** One car's values and notes for one corner. */
export function CornerGuideForm({
  guideId,
  cornerId,
  label,
  guide,
  onDirtyChange,
  children,
}: {
  guideId: string;
  cornerId: string;
  label: string;
  guide: CornerGuide | undefined;
  onDirtyChange(dirty: boolean): void;
  children?: ReactNode;
}) {
  // The record as last saved here, until the refetched prop catches up. A
  // line point saved from the map also updates the prop: the newest wins.
  const [local, setLocal] = useState<CornerGuide | undefined>(undefined);
  const saved = !local || (guide && guide.updatedAt >= local.updatedAt) ? guide : local;
  const [draft, setDraft] = useState(() => draftFrom(guide));
  const [errors, setErrors] = useState<Errors>({});
  const save = useSaveCornerGuide();
  const id = useId();

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(saved));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = (field: keyof GuideDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  function submit() {
    const result = parseDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(
      { guideId, cornerId, existing: saved, patch: result.patch },
      { onSuccess: (next) => setLocal(next) },
    );
  }

  const field = (name: keyof GuideDraft, text: string, input: "number" | "text" = "number") => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${name}`}>{text}</Label>
      <Input
        id={`${id}-${name}`}
        inputMode={input === "number" ? "decimal" : undefined}
        value={draft[name]}
        onChange={(e) => set(name)(e.target.value)}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
      />
      {errors[name] && (
        <p id={`${id}-${name}-error`} className="text-xs text-danger">
          {errors[name]}
        </p>
      )}
    </div>
  );
  const notes = (name: keyof GuideDraft, text: string) => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${name}`}>{text}</Label>
      <Textarea
        id={`${id}-${name}`}
        value={draft[name]}
        onChange={(e) => set(name)(e.target.value)}
        className="h-20"
      />
    </div>
  );

  return (
    <form
      aria-label={label}
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="font-medium">{label}</h3>
      {children}
      <div className="grid grid-cols-3 gap-2">
        {field("entrySpeedKmh", "Entry speed (km/h)")}
        {field("minSpeedKmh", "Minimum speed (km/h)")}
        {field("exitSpeedKmh", "Exit speed (km/h)")}
        {field("gear", "Gear")}
        {field("downshiftTo", "Downshift to")}
        {field("brakeMarkerMeters", "Brake board (m)")}
      </div>
      {field("brakeReference", "Brake reference", "text")}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-brakePressure`}>Brake pressure</Label>
          <select
            id={`${id}-brakePressure`}
            value={draft.brakePressure}
            onChange={(e) => set("brakePressure")(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">—</option>
            {BrakePressure.options.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {field("brakePressurePct", "Pressure (%)")}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <Label htmlFor={`${id}-cue`}>Cue</Label>
          <span className="text-xs text-muted tabular-nums">
            {draft.cue.trim().length}/{CUE_MAX_LENGTH}
          </span>
        </div>
        <Input
          id={`${id}-cue`}
          value={draft.cue}
          onChange={(e) => set("cue")(e.target.value)}
          aria-invalid={errors.cue ? true : undefined}
          aria-describedby={errors.cue ? `${id}-cue-error` : undefined}
        />
        {errors.cue && (
          <p id={`${id}-cue-error`} className="text-xs text-danger">
            {errors.cue}
          </p>
        )}
      </div>
      {notes("throttleNotes", "Throttle notes")}
      {notes("trailBrakeNotes", "Trail-brake notes")}
      {notes("notes", "Car notes")}
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending} aria-label="Save car values">
          {save.error ? "Retry" : "Save"}
        </Button>
        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => {
            setDraft(draftFrom(saved));
            setErrors({});
            save.reset();
          }}
        >
          Cancel
        </Button>
        <p aria-live="polite" className="text-sm text-muted">
          {save.isSuccess && !dirty && "Saved"}
        </p>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/track-view/edit/corner-guide-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/track-view/edit/corner-guide-form.tsx apps/web/src/features/track-view/edit/corner-guide-form.test.tsx
git commit -m "feat(web): edit a car's values and notes for a corner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Placing line points on the map

**Files:**

- Modify: `apps/web/src/features/track-view/track-canvas.tsx` (new `onPick` prop)
- Create: `apps/web/src/features/track-view/edit/line-points.tsx`
- Test: `apps/web/src/features/track-view/track-canvas.test.tsx` (add cases), `apps/web/src/features/track-view/edit/line-points.test.tsx`

**Interfaces:**

- Consumes: `nearestFraction`, `checkLineOrder`, `lapDelta`, `LinePoint` (Task 2); `useSaveCornerGuide` (Task 4); `rotatePoint` from `./geometry/bounds`.
- Produces:
  - `TrackCanvas` prop `onPick?: (fraction: number) => void`. While set: the cursor is a crosshair, overlays get `pointer-events: none`, and a click/tap that did not move more than 5 px calls `onPick` with the snapped lap fraction.
  - `LinePoints({ guideId, cornerId, guide, cornerFraction, lengthMeters, hasOutline, picking, onPickStart, onPickEnd })` where `picking: LinePoint | null`, `onPickStart(point: LinePoint): void`, `onPickEnd(): void`.
  - `useLinePointPick({ guideId, cornerId, guide, cornerFraction, lengthMeters, point, onDone }): (fraction: number) => void` — the handler the page passes as `TrackCanvas.onPick`; validates order and distance then saves. Exported from `line-points.tsx`.

- [ ] **Step 1: Write the failing canvas test**

Read `apps/web/src/features/track-view/track-canvas.test.tsx` first and follow its existing setup (`mockLayout()` from `@/test/dom`). Add:

```tsx
describe("TrackCanvas pick mode", () => {
  it("reports the lap position of a click, and ignores drags", () => {
    mockLayout(800, 600);
    const onPick = vi.fn();
    render(
      <TrackCanvas outlinePath="M 0 0 L 100 0 L 100 100 L 0 100 Z" label="Map" onPick={onPick} />,
    );
    const surface = screen.getByRole("img", { name: "Map" }).parentElement!;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    } as DOMRect);
    // Fitted square spans 504 px (600 − 2×48) and is centered: x 148–652, y 48–552.
    fireEvent.pointerDown(surface, { clientX: 400, clientY: 48 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 48 });
    fireEvent.click(surface, { clientX: 400, clientY: 48 });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toBeCloseTo(0.125, 2);

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 48 });
    fireEvent.pointerUp(surface, { clientX: 460, clientY: 48 });
    fireEvent.click(surface, { clientX: 460, clientY: 48 });
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
```

If the fitted box differs from the numbers in the comment, read `fitToViewport` in `geometry/fit.ts` and correct the click coordinates so they land on the middle of the top edge; the assertion (≈ 0.125) stays.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/track-canvas.test.tsx`
Expected: FAIL — `onPick` never called.

- [ ] **Step 3: Implement pick mode in `TrackCanvas`**

Add to imports: `import { rotatePoint } from "./geometry/bounds";` and `import { nearestFraction } from "./geometry/nearest";`, and `useRef` is already imported.

Add the prop to `TrackCanvasProps`:

```ts
  /** Pick mode: a click/tap (not a drag) reports the nearest lap position. */
  onPick?: (fraction: number) => void;
```

Destructure `onPick` in the component. Inside the component, before `return`:

```ts
const down = useRef<{ x: number; y: number } | null>(null);
const pickProps = onPick
  ? {
      onPointerDown: (e: React.PointerEvent) => {
        down.current = { x: e.clientX, y: e.clientY };
      },
      onClick: (e: React.MouseEvent<HTMLDivElement>) => {
        const start = down.current;
        down.current = null;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const screen = composeAffine(zoom, fit);
        const display = {
          x: (e.clientX - rect.left - screen.x) / screen.k,
          y: (e.clientY - rect.top - screen.y) / screen.k,
        };
        const outline = rotatePoint(display, -geometry.rotation, geometry.pivot);
        onPick(nearestFraction(geometry.path, outline));
      },
    }
  : {};
```

`fireEvent.click` in the test carries the last pointer position; jsdom's `pointerUp` doesn't matter here, the click's own coordinates are compared with the pointer-down ones.

On the container `div`, spread `{...pickProps}` and change the class so pick mode shows a crosshair:

```tsx
      className={`absolute inset-0 touch-none overflow-hidden select-none ${
        onPick ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
      }`}
```

Wrap the overlay so markers don't swallow clicks while picking:

```tsx
{
  ready && (
    <div className={onPick ? "pointer-events-none contents" : "contents"}>{overlay?.(ctx)}</div>
  );
}
```

If `contents` breaks the markers' absolute positioning, use `<div className={onPick ? "pointer-events-none" : undefined}>` with no other classes instead — the markers position against the container, which is still the nearest positioned ancestor.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/track-view/track-canvas.test.tsx`
Expected: PASS (existing cases too).

- [ ] **Step 5: Write the failing `LinePoints` test**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CornerGuide } from "@track-day/schema";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { emptyCornerGuide } from "./corner-guide-draft";
import { LinePoints, useLinePointPick } from "./line-points";

const guide = (line: Partial<CornerGuide["line"]> = {}) =>
  ({
    ...emptyCornerGuide("g1", "c1"),
    id: "cg1",
    line: {
      turnIn: null,
      apex: null,
      exit: null,
      turnInAt: null,
      apexAt: 0.5,
      exitAt: null,
      ...line,
    },
  }) as CornerGuide;

function wrap(repos: Partial<Repositories>) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos as Repositories}>{children}</RepositoriesProvider>
    </QueryClientProvider>
  );
}

describe("useLinePointPick", () => {
  const base = { guideId: "g1", cornerId: "c1", cornerFraction: 0.5, lengthMeters: 4000 };

  it("saves a point that keeps the order", async () => {
    const update = vi.fn().mockResolvedValue(guide());
    const onDone = vi.fn();
    const { result } = renderHook(
      () => useLinePointPick({ ...base, guide: guide(), point: "turnIn", onDone }),
      { wrapper: wrap({ cornerGuides: { update } as never }) },
    );
    await act(async () => result.current(0.49));
    expect(update).toHaveBeenCalledWith(
      "cg1",
      expect.objectContaining({ line: expect.objectContaining({ turnInAt: 0.49, apexAt: 0.5 }) }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("refuses a point out of order", async () => {
    const update = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(
      () =>
        useLinePointPick({ ...base, guide: guide(), point: "turnIn", onDone: vi.fn(), onError }),
      { wrapper: wrap({ cornerGuides: { update } as never }) },
    );
    await act(async () => result.current(0.51));
    expect(update).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Turn-in must come before the apex and exit.");
  });

  it("asks before saving a point far from the corner", async () => {
    const update = vi.fn().mockResolvedValue(guide());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(
      () => useLinePointPick({ ...base, guide: guide(), point: "exit", onDone: vi.fn() }),
      { wrapper: wrap({ cornerGuides: { update } as never }) },
    );
    await act(async () => result.current(0.6)); // 400 m after the corner
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("400 m"));
    expect(update).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe("LinePoints", () => {
  it("starts picking, clears a point, and is disabled without an outline", async () => {
    const update = vi.fn().mockResolvedValue(guide());
    const onPickStart = vi.fn();
    const props = {
      guideId: "g1",
      cornerId: "c1",
      guide: guide(),
      cornerFraction: 0.5,
      lengthMeters: 4000,
      picking: null,
      onPickStart,
      onPickEnd: vi.fn(),
    };
    const Wrapper = wrap({ cornerGuides: { update } as never });
    const { rerender } = render(<LinePoints {...props} hasOutline />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole("button", { name: "Set turn-in" }));
    expect(onPickStart).toHaveBeenCalledWith("turnIn");
    await userEvent.click(screen.getByRole("button", { name: "Clear apex" }));
    expect(update).toHaveBeenCalledWith(
      "cg1",
      expect.objectContaining({ line: expect.objectContaining({ apexAt: null }) }),
    );

    rerender(<LinePoints {...props} hasOutline={false} />);
    expect(screen.getByRole("button", { name: "Set apex" })).toBeDisabled();
    expect(screen.getByText(/Add a map from OpenStreetMap/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/edit/line-points.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `line-points.tsx`**

```tsx
"use client";

import type { CornerGuide } from "@track-day/schema";
import { Button } from "@/shared/ui/button";
import { checkLineOrder, lapDelta, type LinePoint } from "../geometry/nearest";
import { useSaveCornerGuide } from "./use-edit-mutations";

const FAR_METERS = 300;
const NAMES: Record<LinePoint, string> = { turnIn: "turn-in", apex: "apex", exit: "exit" };
const AT = { turnIn: "turnInAt", apex: "apexAt", exit: "exitAt" } as const;

const positions = (guide: CornerGuide | undefined) => ({
  turnIn: guide?.line.turnInAt ?? null,
  apex: guide?.line.apexAt ?? null,
  exit: guide?.line.exitAt ?? null,
});

const lineWith = (guide: CornerGuide | undefined, point: LinePoint, value: number | null) => ({
  ...(guide?.line ?? {
    turnIn: null,
    apex: null,
    exit: null,
    turnInAt: null,
    apexAt: null,
    exitAt: null,
  }),
  [AT[point]]: value,
});

interface PickOptions {
  guideId: string;
  cornerId: string;
  guide: CornerGuide | undefined;
  /** The corner's own position, to warn about far-away points. */
  cornerFraction: number | null;
  lengthMeters: number | null;
  point: LinePoint;
  onDone(): void;
  onError?(message: string): void;
}

/** Click handler for the map while a line point is being placed. */
export function useLinePointPick({
  guideId,
  cornerId,
  guide,
  cornerFraction,
  lengthMeters,
  point,
  onDone,
  onError,
}: PickOptions) {
  const save = useSaveCornerGuide();
  return async (fraction: number) => {
    if (!checkLineOrder({ ...positions(guide), [point]: fraction })) {
      onError?.(
        point === "turnIn"
          ? "Turn-in must come before the apex and exit."
          : point === "apex"
            ? "The apex must come between turn-in and exit."
            : "The exit must come after turn-in and the apex.",
      );
      return;
    }
    if (cornerFraction !== null && lengthMeters) {
      const meters = Math.round(Math.abs(lapDelta(cornerFraction, fraction)) * lengthMeters);
      if (
        meters > FAR_METERS &&
        !window.confirm(
          `This is ${meters} m from the corner — place the ${NAMES[point]} here anyway?`,
        )
      ) {
        return;
      }
    }
    await save.mutateAsync({
      guideId,
      cornerId,
      existing: guide,
      patch: { line: lineWith(guide, point, fraction) },
    });
    onDone();
  };
}

export function LinePoints({
  guideId,
  cornerId,
  guide,
  hasOutline,
  picking,
  onPickStart,
  onPickEnd,
}: {
  guideId: string;
  cornerId: string;
  guide: CornerGuide | undefined;
  cornerFraction: number | null;
  lengthMeters: number | null;
  hasOutline: boolean;
  picking: LinePoint | null;
  onPickStart(point: LinePoint): void;
  onPickEnd(): void;
}) {
  const save = useSaveCornerGuide();
  const set = positions(guide);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Line</legend>
      <div className="flex flex-wrap gap-2">
        {(["turnIn", "apex", "exit"] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1">
            <Button
              variant="outline"
              aria-pressed={picking === p}
              disabled={!hasOutline}
              onClick={() => (picking === p ? onPickEnd() : onPickStart(p))}
            >
              Set {NAMES[p]}
              {set[p] !== null && " ✓"}
            </Button>
            {set[p] !== null && (
              <Button
                variant="outline"
                aria-label={`Clear ${NAMES[p]}`}
                onClick={() =>
                  save.mutate({
                    guideId,
                    cornerId,
                    existing: guide,
                    patch: { line: lineWith(guide, p, null) },
                  })
                }
              >
                ×
              </Button>
            )}
          </span>
        ))}
      </div>
      {picking && (
        <p className="text-sm text-muted" aria-live="polite">
          Click or tap the track to place the {NAMES[picking]}.
        </p>
      )}
      {!hasOutline && (
        <p className="text-sm text-muted">
          Add a map from OpenStreetMap to place the line on the track.
        </p>
      )}
    </fieldset>
  );
}
```

`cornerFraction` and `lengthMeters` are accepted by `LinePoints` for symmetry with the hook but only the hook uses them; the page passes the same values to both.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter web test src/features/track-view`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/track-view
git commit -m "feat(web): place a car's turn-in, apex and exit on the map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Edit mode in the track view, with the car's generated lines

**Files:**

- Create: `apps/web/src/features/track-view/edit/car-lines.tsx`
- Modify: `apps/web/src/features/track-view/track-view-page.tsx`
- Modify: `apps/web/src/features/track-view/racing-line.tsx` (dim prop)
- Test: `apps/web/src/features/track-view/edit/car-lines.test.tsx`, `apps/web/src/features/track-view/track-view-page.test.tsx` (create)

**Interfaces:**

- Consumes: Tasks 3–7. `cornerFraction` from `./geometry/anchors`; `createTrackPath`.
- Produces:
  - `carLines(input: { outlinePath: string; lengthMeters: number | null; corners: Corner[]; cornerGuides: CornerGuide[] }): { cornerId: string; d: string; estimated: boolean }[]` — one generated line per corner whose car guide has any `*At` set.
  - `CarLinesLayer({ lines }: { lines: ReturnType<typeof carLines> })` — paths with `data-testid="car-line"`, class `stroke-racing-line`, dashed when estimated.
  - `RacingLineLayer` gains `dim?: boolean` (opacity 0.35 when the car has its own lines).
  - Track view URL: `edit=1` turns edit mode on.

Behavior in the page:

- Toolbar: **Edit** `ToolButton` (pressed when `edit=1`). The guide `select` is always shown when there is a layout (label "Car"), with an extra option **+ Add car…** (value `__add__`) that opens the Add car dialog (Task 9; until then the option does nothing — Task 9 wires it).
- When edit mode is on and a corner is selected, `CornerDetails` gets `actions` = the practice link, and `guide` = `<CornerNotesForm key={corner.id} …/>` followed by either `<CornerGuideForm key={`${guide.id}:${corner.id}`} …><LinePoints …/></CornerGuideForm>` or, without any guide, a dashed box "Add a car to record its values for this corner." with an **Add car** button.
- `picking` state (`LinePoint | null`) lives in the page; `TrackCanvas.onPick` is `pickHandler` from `useLinePointPick` while `picking !== null`, else `undefined`. Picking ends on save, on Escape, on corner change and when leaving edit mode. Pick errors show in a `role="status"` line under the line buttons.
- Unsaved edits: the page keeps `dirty` as `Record<string, boolean>` fed by `onDirtyChange` (keys `"corner"` and `"guide"`). `confirmDiscard()` returns `true` when nothing is dirty, else `window.confirm("Discard unsaved changes?")`. It guards: selecting another corner, changing car, closing the panel and turning edit mode off.
- Car lines: built with `carLines(...)` from the selected guide's corner guides, drawn in `trackLayers` on top of the layout racing line (dimmed when any car line exists), in both view and edit modes, when the racing line toggle is on. The racing line toggle is enabled when either exists.

- [ ] **Step 1: Write the failing `carLines` test**

```tsx
// @vitest-environment node
import type { Corner, CornerGuide } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { emptyCornerGuide } from "./corner-guide-draft";
import { carLines } from "./car-lines";

const corner = (id: string, direction: Corner["direction"]) =>
  ({ id, direction, pathPosition: 0.125, distanceFromStartMeters: null }) as Corner;
const cg = (cornerId: string, line: Partial<CornerGuide["line"]>) =>
  ({
    ...emptyCornerGuide("g1", cornerId),
    id: `cg-${cornerId}`,
    line: {
      turnIn: null,
      apex: null,
      exit: null,
      turnInAt: null,
      apexAt: null,
      exitAt: null,
      ...line,
    },
  }) as CornerGuide;

describe("carLines", () => {
  const outlinePath = "M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z";
  it("builds a line for each corner the car has points for", () => {
    const lines = carLines({
      outlinePath,
      lengthMeters: 4000,
      corners: [corner("a", "right"), corner("b", "left"), corner("c", null)],
      cornerGuides: [cg("a", { apexAt: 0.125 }), cg("b", {}), cg("c", { apexAt: 0.3 })],
    });
    expect(lines.map((l) => l.cornerId)).toEqual(["a"]);
    expect(lines[0]!.d).toMatch(/^M/);
    expect(lines[0]!.estimated).toBe(true);
  });

  it("returns nothing without a lap length", () => {
    expect(
      carLines({
        outlinePath,
        lengthMeters: null,
        corners: [corner("a", "right")],
        cornerGuides: [cg("a", { apexAt: 0.125 })],
      }),
    ).toEqual([]);
  });
});
```

Note: a car guide with only `turnInAt` (no `apexAt`) uses the corner's own position as the apex, so a line still shows while placing points one by one. Add that case:

```tsx
it("falls back to the corner's position for the apex", () => {
  const lines = carLines({
    outlinePath,
    lengthMeters: 4000,
    corners: [corner("a", "right")],
    cornerGuides: [cg("a", { turnInAt: 0.11 })],
  });
  expect(lines).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/edit/car-lines.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `car-lines.tsx`**

```tsx
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
        estimated: generated.estimated,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/track-view/edit/car-lines.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

`track-view-page.test.tsx` renders the page against real local repositories seeded with the Interlagos example and a manual guide. Mock `next/navigation` with a URL that the test can change:

```tsx
import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { mockLayout } from "@/test/dom";
import { TrackViewPage } from "./track-view-page";

let search = new URLSearchParams();
const replace = vi.fn((url: string) => {
  search = new URLSearchParams(url.split("?")[1]);
  rerenderPage();
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/tracks/view/",
}));

let db: TrackDayDb;
let repos: Repositories;
let rerenderPage = () => {};

beforeEach(() => {
  mockLayout();
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});
afterEach(() => db.delete());

async function open(params: Record<string, string>) {
  const { trackId, layoutId } = await repos.trackImport.importTrack(
    TrackImportPayload.parse(interlagos),
  );
  const cls = await repos.carClasses.create({
    name: "GT3",
    description: "",
    drivetrain: null,
    downforce: null,
  });
  const guide = await repos.guides.create({
    layoutId,
    target: { carClassId: cls.id },
    sim: null,
    referenceLapTime: null,
    setupNotes: "",
    source: "manual",
  });
  const t1 = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === 1)!;
  const t2 = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === 2)!;
  search = new URLSearchParams({ track: trackId, layout: layoutId, guide: guide.id, ...params });
  const client = new QueryClient();
  const ui = () => (
    <QueryClientProvider client={client}>
      <RepositoriesProvider repositories={repos}>
        <TrackViewPage />
      </RepositoriesProvider>
    </QueryClientProvider>
  );
  const view = render(ui());
  rerenderPage = () => view.rerender(ui());
  return { t1, t2, guide, user: userEvent.setup() };
}

describe("TrackViewPage edit mode", () => {
  it("shows the edit forms for the selected corner", async () => {
    const { t1 } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    expect(
      await screen.findByRole("form", { name: "Corner notes (all cars)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /GT3 · any sim/ })).toBeInTheDocument();
  });

  it("asks before leaving a corner with unsaved edits, and not otherwise", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    await user.click(await screen.findByRole("button", { name: /^Turn 2,/ }));
    expect(confirm).not.toHaveBeenCalled();

    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    await user.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
    expect(search.get("corner")).toBe(t1.id);
    confirm.mockRestore();
  });

  it("toggles edit mode from the toolbar", async () => {
    const { user } = await open({});
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(search.get("edit")).toBe("1");
  });
});
```

If the markers are not reachable by name in jsdom because the canvas has no size, `mockLayout()` gives it 800×600 (as other track-view tests do). If `findByRole("button", { name: /^Turn 2,/ })` still fails, open the corner list (`Corners` button) and click `T2` there instead.

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/track-view-page.test.tsx`
Expected: FAIL — no Edit button / no forms.

- [ ] **Step 7: Wire the page**

In `track-view-page.tsx`:

1. Imports:

```ts
import { CornerGuideForm } from "./edit/corner-guide-form";
import { CornerNotesForm } from "./edit/corner-notes-form";
import { CarLinesLayer, carLines } from "./edit/car-lines";
import { LinePoints, useLinePointPick } from "./edit/line-points";
import type { LinePoint } from "./geometry/nearest";
```

2. State, after `const [redoingMap, …]`:

```ts
const editing = params.get("edit") === "1";
const [picking, setPicking] = useState<LinePoint | null>(null);
const [pickError, setPickError] = useState<string | null>(null);
const [dirty, setDirty] = useState<Record<string, boolean>>({});
const markDirty = useCallback(
  (key: string) => (value: boolean) =>
    setDirty((d) => (d[key] === value ? d : { ...d, [key]: value })),
  [],
);
const onCornerDirty = useMemo(() => markDirty("corner"), [markDirty]);
const onGuideDirty = useMemo(() => markDirty("guide"), [markDirty]);
const confirmDiscard = useCallback(
  () => !Object.values(dirty).some(Boolean) || window.confirm("Discard unsaved changes?"),
  [dirty],
);
```

3. Guard navigation. Replace `selectCorner` and `closePanel`:

```ts
const selectCorner = useCallback(
  (id: string) => {
    if (!confirmDiscard()) return;
    setDirty({});
    setPicking(null);
    setParams({ corner: id, panel: null });
  },
  [setParams, confirmDiscard],
);
const closePanel = useCallback(() => {
  if (!confirmDiscard()) return;
  setDirty({});
  setPicking(null);
  setParams({ corner: null, panel: null });
}, [setParams, confirmDiscard]);
const toggleEdit = useCallback(() => {
  if (editing && !confirmDiscard()) return;
  setDirty({});
  setPicking(null);
  setParams({ edit: editing ? null : "1" });
}, [editing, confirmDiscard, setParams]);
```

4. Escape cancels picking:

```ts
useEffect(() => {
  if (!picking) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setPicking(null);
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, [picking]);
```

5. Pick handler (hooks must run before the early returns, so compute with optional data):

```ts
const selectedGuide = cornerGuides?.find((g) => g.cornerId === cornerId);
const pick = useLinePointPick({
  guideId: guide?.id ?? "",
  cornerId: cornerId ?? "",
  guide: selectedGuide,
  cornerFraction: selectedFraction,
  lengthMeters: data?.layout?.lengthMeters ?? null,
  point: picking ?? "apex",
  onDone: () => {
    setPicking(null);
    setPickError(null);
  },
  onError: setPickError,
});
const lines = useMemo(
  () =>
    data?.layout?.outlinePath && cornerGuides
      ? carLines({
          outlinePath: data.layout.outlinePath,
          lengthMeters: data.layout.lengthMeters,
          corners: data.corners,
          cornerGuides,
        })
      : [],
  [data, cornerGuides],
);
```

6. In the panel, when `selected`: pass `guide=` as

```tsx
          guide={
            editing ? (
              <div className="space-y-4">
                <CornerNotesForm
                  key={selected.id}
                  trackId={track.id}
                  corner={selected}
                  onDirtyChange={onCornerDirty}
                />
                {guide && currentGuideLabel ? (
                  <CornerGuideForm
                    key={`${guide.id}:${selected.id}`}
                    guideId={guide.id}
                    cornerId={selected.id}
                    label={`${currentGuideLabel} · T${selected.number}`}
                    guide={cornerGuides?.find((g) => g.cornerId === selected.id)}
                    onDirtyChange={onGuideDirty}
                  >
                    <LinePoints
                      guideId={guide.id}
                      cornerId={selected.id}
                      guide={cornerGuides?.find((g) => g.cornerId === selected.id)}
                      cornerFraction={selectedFraction}
                      lengthMeters={layout.lengthMeters}
                      hasOutline={layout.outlinePath !== null}
                      picking={picking}
                      onPickStart={(p) => {
                        setPickError(null);
                        setPicking(p);
                      }}
                      onPickEnd={() => setPicking(null)}
                    />
                    {pickError && (
                      <p role="status" className="text-sm text-danger">
                        {pickError}
                      </p>
                    )}
                  </CornerGuideForm>
                ) : (
                  <section className="rounded-lg border border-dashed border-border p-3 text-muted">
                    Add a car to record its values for this corner.
                  </section>
                )}
              </div>
            ) : (
              guide &&
              currentGuideLabel && (
                <CornerGuideSection
                  guide={cornerGuides?.find((g) => g.cornerId === selected.id)}
                  label={currentGuideLabel}
                />
              )
            )
          }
```

`CornerDetails` still renders the read-only notes and mistakes below `guide`; in edit mode hide them by passing a new prop `hideNotes={editing}` to `CornerDetails` and wrapping its two notes sections in `{!hideNotes && …}` (add `hideNotes?: boolean` to `CornerDetailsProps`).

7. `TrackCanvas`:

```tsx
            trackLayers={() =>
              showRacingLine && (
                <>
                  {racingLine && <RacingLineLayer line={racingLine} dim={lines.length > 0} />}
                  <CarLinesLayer lines={lines} />
                </>
              )
            }
            onPick={editing && picking ? (f) => void pick(f) : undefined}
```

and the racing line `ToolButton`: `pressed={showRacingLine && (racingLine !== null || lines.length > 0)}`, `disabled={!racingLine && lines.length === 0}`.

8. In `racing-line.tsx`, add `dim` to `RacingLineLayer`: signature `({ line, dim = false }: { line: RacingLine; dim?: boolean })` and `opacity={dim ? 0.35 : 1}` on the path.

9. Toolbar: add before the `Corners` button

```tsx
<ToolButton pressed={editing} onClick={toggleEdit}>
  Edit
</ToolButton>
```

and change the guide `select`'s `aria-label` to `"Car"`, guard its `onChange` with `if (!confirmDiscard()) return; setDirty({});`. (The `+ Add car…` option is added in Task 9.)

10. The same `Edit` button and forms work on the corners-only view (`!layout.outlinePath`): `NoOutline` has no canvas, so `LinePoints` shows its disabled state there. Add the `Edit` `ToolButton` to that branch's `controls` (currently `null`): `controls={<ToolButton pressed={editing} onClick={toggleEdit}>Edit</ToolButton>}`.

- [ ] **Step 8: Run the tests**

Run: `pnpm --filter web test src/features/track-view && pnpm typecheck && pnpm lint`
Expected: PASS. Update any existing test that looked the guide select up by `"Guide"` to `"Car"`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/track-view
git commit -m "feat(web): edit mode in the track view, with the car's own racing line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Add car (empty, or from an AI guide)

**Files:**

- Create: `apps/web/src/features/track-view/edit/guide-payload.ts`
- Create: `apps/web/src/features/track-view/edit/add-car-dialog.tsx`
- Modify: `apps/web/src/features/track-view/edit/use-edit-mutations.ts` (add `useAddCar`)
- Modify: `apps/web/src/features/track-view/track-view-page.tsx` (wire the option and the empty-state button)
- Test: `apps/web/src/features/track-view/edit/guide-payload.test.ts`, `apps/web/src/features/track-view/edit/add-car-dialog.test.tsx`

**Interfaces:**

- Consumes: `buildGuidePrompt`, `readAiError` from `@track-day/prompts`; `parseImport`, `GuideImportPayload`, `SIMS`, `SimId`, `TrackImportPayload` from `@track-day/schema`; `IssueList`.
- Produces:
  - `trackPayloadFor(track: Track, layout: Layout, corners: Corner[]): TrackImportPayload | null` — `null` when the layout has no length or direction, or a corner has no direction (the AI option is then disabled with a hint).
  - `missingCorners(payload: GuideImportPayload, corners: Corner[]): number[]`
  - `useAddCar(layoutId: string)` → mutation `{ name: string; sim: SimId | null; className: string; guide: GuideImportPayload | null }` returning `{ guideId: string }`.
  - `AddCarDialog({ open, onOpenChange, track, layout, corners, carClasses, onAdded })` with `onAdded(guideId: string): void`.

- [ ] **Step 1: Write the failing pure test**

```ts
// @vitest-environment node
import interlagos from "@examples/interlagos.track.json";
import type { Corner, Layout, Track } from "@track-day/schema";
import { GuideImportPayload } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { missingCorners, trackPayloadFor } from "./guide-payload";

const track = {
  name: "Interlagos",
  aliases: [],
  country: "Brazil",
  city: "São Paulo",
} as unknown as Track;
const layout = { name: "GP", lengthMeters: 4309, direction: "anticlockwise" } as Layout;
const corners = interlagos.corners.map((c, i) => ({
  id: `c${i}`,
  number: c.number,
  name: c.name ?? null,
  direction: c.direction,
  type: null,
  elevation: null,
  camber: null,
  distanceFromStartMeters: c.distanceFromStartMeters ?? null,
  notes: "",
  commonMistakes: [],
})) as unknown as Corner[];

describe("trackPayloadFor", () => {
  it("describes the layout and its corners by number", () => {
    const payload = trackPayloadFor(track, layout, corners)!;
    expect(payload).toMatchObject({ kind: "track", layout: { lengthMeters: 4309 } });
    expect(payload.corners).toHaveLength(corners.length);
  });

  it("is null when the AI would lack required facts", () => {
    expect(trackPayloadFor(track, { ...layout, lengthMeters: null }, corners)).toBeNull();
    expect(
      trackPayloadFor(track, layout, [{ ...corners[0]!, direction: null }, ...corners.slice(1)]),
    ).toBeNull();
  });
});

describe("missingCorners", () => {
  it("lists corner numbers the layout doesn't have", () => {
    const payload = GuideImportPayload.parse({
      schemaVersion: 1,
      kind: "guide",
      guide: {},
      corners: [{ cornerNumber: 1 }, { cornerNumber: 99 }],
    });
    expect(missingCorners(payload, corners)).toEqual([99]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/edit/guide-payload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `guide-payload.ts`**

```ts
import {
  CURRENT_SCHEMA_VERSION,
  type Corner,
  type GuideImportPayload,
  type Layout,
  type Track,
  type TrackImportPayload,
} from "@track-day/schema";

/** The layout in import format, for the car guide prompt; null if facts the AI needs are missing. */
export function trackPayloadFor(
  track: Track,
  layout: Layout,
  corners: Corner[],
): TrackImportPayload | null {
  if (!layout.lengthMeters || !layout.direction) return null;
  if (corners.length === 0 || corners.some((c) => c.direction === null)) return null;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: "track",
    track: { name: track.name, aliases: track.aliases, country: track.country, city: track.city },
    layout: { name: layout.name, lengthMeters: layout.lengthMeters, direction: layout.direction },
    corners: corners.map((c) => ({
      number: c.number,
      name: c.name,
      direction: c.direction!,
      type: c.type,
      elevation: c.elevation,
      camber: c.camber,
      distanceFromStartMeters: c.distanceFromStartMeters,
      notes: c.notes || null,
      commonMistakes: c.commonMistakes,
    })),
  };
}

export function missingCorners(payload: GuideImportPayload, corners: Corner[]): number[] {
  const numbers = new Set(corners.map((c) => c.number));
  return payload.corners.map((c) => c.cornerNumber).filter((n) => !numbers.has(n));
}
```

If `typecheck` complains that `TrackImportPayload` is a refined (`superRefine`) type and object literals don't fit, build the object and return `TrackImportPayload.parse(obj)` inside a `try` (returning `null` on failure) instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/track-view/edit/guide-payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `useAddCar` to `use-edit-mutations.ts`**

```ts
import type { GuideImportPayload, SimId } from "@track-day/schema";

interface AddCarInput {
  name: string;
  sim: SimId | null;
  /** Existing class name, or a new one to create. */
  className: string;
  /** null = start with an empty guide. */
  guide: GuideImportPayload | null;
}

/** Creates the car (and its class if new), then an empty or imported guide for the layout. */
export function useAddCar(layoutId: string) {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, sim, className, guide }: AddCarInput) => {
      const wanted = className.trim() || "Other";
      const existing = (await repos.carClasses.list()).find(
        (c) => c.name.toLowerCase() === wanted.toLowerCase(),
      );
      const carClass =
        existing ??
        (await repos.carClasses.create({
          name: wanted,
          description: "",
          drivetrain: null,
          downforce: null,
        }));
      const car = await repos.cars.create({
        name: name.trim(),
        classId: carClass.id,
        sim,
        powerHp: null,
        weightKg: null,
        drivetrain: null,
        downforce: null,
        transmission: null,
        abs: null,
        tc: null,
      });
      const target = { carId: car.id };
      if (guide) return repos.guideImport.importGuide(guide, { layoutId, target, sim });
      const created = await repos.guides.create({
        layoutId,
        target,
        sim,
        referenceLapTime: null,
        setupNotes: "",
        source: "manual",
      });
      return { guideId: created.id };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.all }),
  });
}
```

The dialog checks `missingCorners` before calling this, so an AI guide that names unknown corners never creates a car.

- [ ] **Step 6: Write the failing dialog test**

```tsx
import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CarClass, Corner, Layout, Track } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { AddCarDialog } from "./add-car-dialog";

const track = {
  id: "t1",
  name: "Interlagos",
  aliases: [],
  country: null,
  city: null,
} as unknown as Track;
const layout = { id: "l1", name: "GP", lengthMeters: 4309, direction: "anticlockwise" } as Layout;
const corners = interlagos.corners.map((c, i) => ({
  id: `c${i}`,
  number: c.number,
  name: null,
  direction: c.direction,
  type: null,
  elevation: null,
  camber: null,
  distanceFromStartMeters: null,
  notes: "",
  commonMistakes: [],
})) as unknown as Corner[];
const carClasses = [{ id: "k1", name: "Road car" }] as CarClass[];

function setup() {
  const repos = {
    carClasses: {
      list: vi.fn().mockResolvedValue(carClasses),
      create: vi.fn().mockResolvedValue({ id: "k2", name: "GT3" }),
    },
    cars: { create: vi.fn().mockResolvedValue({ id: "car1" }) },
    guides: { create: vi.fn().mockResolvedValue({ id: "g1" }) },
    guideImport: { importGuide: vi.fn().mockResolvedValue({ guideId: "g2" }) },
  };
  const onAdded = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos as unknown as Repositories}>
        <AddCarDialog
          open
          onOpenChange={vi.fn()}
          track={track}
          layout={layout}
          corners={corners}
          carClasses={carClasses}
          onAdded={onAdded}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { repos, onAdded, user: userEvent.setup() };
}

describe("AddCarDialog", () => {
  it("creates a car with an empty guide", async () => {
    const { repos, onAdded, user } = setup();
    await user.type(screen.getByLabelText("Car name"), "Mazda MX-5");
    await user.selectOptions(screen.getByLabelText("Sim"), "assetto-corsa");
    await user.clear(screen.getByLabelText("Class"));
    await user.type(screen.getByLabelText("Class"), "road car");
    await user.click(screen.getByRole("button", { name: "Add car" }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledWith("g1"));
    expect(repos.carClasses.create).not.toHaveBeenCalled(); // matched "Road car"
    expect(repos.cars.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mazda MX-5", classId: "k1", sim: "assetto-corsa" }),
    );
    expect(repos.guides.create).toHaveBeenCalledWith(
      expect.objectContaining({ layoutId: "l1", target: { carId: "car1" }, source: "manual" }),
    );
  });

  it("imports a pasted AI guide", async () => {
    const { repos, onAdded, user } = setup();
    await user.type(screen.getByLabelText("Car name"), "MX-5");
    await user.click(screen.getByRole("radio", { name: "Start from an AI guide" }));
    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("AI answer"));
    await user.paste(
      JSON.stringify({
        schemaVersion: 1,
        kind: "guide",
        guide: {},
        corners: [{ cornerNumber: 1, gear: 2 }],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add car" }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledWith("g2"));
    expect(repos.guideImport.importGuide).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "guide" }),
      expect.objectContaining({ layoutId: "l1", target: { carId: "car1" } }),
    );
  });

  it("creates nothing when the AI guide names a corner the layout doesn't have", async () => {
    const { repos, onAdded, user } = setup();
    await user.type(screen.getByLabelText("Car name"), "MX-5");
    await user.click(screen.getByRole("radio", { name: "Start from an AI guide" }));
    await user.click(screen.getByLabelText("AI answer"));
    await user.paste(
      JSON.stringify({
        schemaVersion: 1,
        kind: "guide",
        guide: {},
        corners: [{ cornerNumber: 99 }],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add car" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no corner 99");
    expect(repos.cars.create).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter web test src/features/track-view/edit/add-car-dialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `add-car-dialog.tsx`**

```tsx
"use client";

import { buildGuidePrompt, readAiError } from "@track-day/prompts";
import {
  GuideImportPayload,
  parseImport,
  SIMS,
  type CarClass,
  type Corner,
  type FieldIssue,
  type Layout,
  type SimId,
  type Track,
} from "@track-day/schema";
import { useId, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { IssueList } from "@/shared/ui/issue-list";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { missingCorners, trackPayloadFor } from "./guide-payload";
import { useAddCar } from "./use-edit-mutations";

export function AddCarDialog({
  open,
  onOpenChange,
  track,
  layout,
  corners,
  carClasses,
  onAdded,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  track: Track;
  layout: Layout;
  corners: Corner[];
  carClasses: CarClass[];
  onAdded(guideId: string): void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [sim, setSim] = useState<SimId | "">("");
  const [className, setClassName] = useState(carClasses[0]?.name ?? "Other");
  const [start, setStart] = useState<"empty" | "ai">("empty");
  const [answer, setAnswer] = useState("");
  const [problem, setProblem] = useState<{ message: string; issues?: FieldIssue[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const add = useAddCar(layout.id);

  const trackPayload = useMemo(
    () => trackPayloadFor(track, layout, corners),
    [track, layout, corners],
  );
  const prompt = useMemo(
    () =>
      trackPayload
        ? buildGuidePrompt({
            track: trackPayload,
            car: {
              name: name || "the car",
              powerHp: null,
              weightKg: null,
              drivetrain: null,
              downforce: null,
              transmission: null,
              abs: null,
              tc: null,
            },
            carClass: { name: className || "Other" },
            sim: sim || null,
          })
        : null,
    [trackPayload, name, className, sim],
  );

  function submit() {
    setProblem(null);
    let guide: GuideImportPayload | null = null;
    if (start === "ai") {
      const reason = readAiError(answer);
      if (reason !== null)
        return setProblem({ message: `The AI couldn’t write the guide: “${reason}”` });
      const result = parseImport(answer, GuideImportPayload);
      if (!result.ok)
        return setProblem({
          message: "The JSON doesn’t match the guide format",
          issues: result.issues,
        });
      const missing = missingCorners(result.value, corners);
      if (missing.length > 0) {
        return setProblem({ message: `This layout has no corner ${missing.join(", ")}.` });
      }
      guide = result.value;
    }
    add.mutate(
      { name, sim: sim || null, className, guide },
      { onSuccess: ({ guideId }) => onAdded(guideId) },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !add.isPending && onOpenChange(next)}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogTitle>Add a car</AlertDialogTitle>
        <AlertDialogDescription>
          Its values and notes are kept per layout. Start empty and fill corners as you learn them,
          or start from an AI estimate.
        </AlertDialogDescription>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-name`}>Car name</Label>
            <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-sim`}>Sim</Label>
              <select
                id={`${id}-sim`}
                value={sim}
                onChange={(e) => setSim(e.target.value as SimId | "")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Any sim</option>
                {SIMS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-class`}>Class</Label>
              <Input
                id={`${id}-class`}
                list={`${id}-classes`}
                value={className}
                onChange={(e) => setClassName(e.target.value)}
              />
              <datalist id={`${id}-classes`}>
                {carClasses.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Start</legend>
            <label className="flex items-center gap-2">
              <input type="radio" checked={start === "empty"} onChange={() => setStart("empty")} />
              Start empty
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={start === "ai"}
                disabled={!prompt}
                onChange={() => setStart("ai")}
              />
              Start from an AI guide
            </label>
            {!prompt && (
              <p className="text-muted">
                An AI guide needs the lap length, direction and every corner’s direction.
              </p>
            )}
          </fieldset>
          {start === "ai" && prompt && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(prompt).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    )
                  }
                >
                  Copy prompt
                </Button>
                <span aria-live="polite" className="text-sm text-muted">
                  {copied && "Copied"}
                </span>
              </div>
              <Label htmlFor={`${id}-answer`}>AI answer</Label>
              <Textarea
                id={`${id}-answer`}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                spellCheck={false}
                className="h-32 font-mono text-xs"
              />
            </div>
          )}
          {problem && (
            <div role="alert" className="space-y-2 text-sm text-danger">
              <p>{problem.message}</p>
              {problem.issues && <IssueList title="Fix these fields" issues={problem.issues} />}
            </div>
          )}
          {add.error && (
            <p role="alert" className="text-sm text-danger">
              Could not add the car: {add.error.message}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={add.isPending}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button
            onClick={submit}
            disabled={
              add.isPending || name.trim() === "" || (start === "ai" && answer.trim() === "")
            }
          >
            Add car
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

If `FieldIssue` is not exported from `@track-day/schema`, import its type the way `shared/ui/issue-list.tsx` does.

- [ ] **Step 9: Wire the dialog into the page**

In `track-view-page.tsx`: `const [addingCar, setAddingCar] = useState(false);`. In the car `select`, render it whenever `layout` exists (not only when `guides.length > 0`), add `<option value="__add__">+ Add car…</option>` last, and in `onChange`:

```ts
onChange={(e) => {
  if (e.target.value === "__add__") return setAddingCar(true);
  if (!confirmDiscard()) return;
  setDirty({});
  setParams({ guide: e.target.value });
}}
```

With no guides, render the select with a disabled placeholder option `"No car yet"` selected plus the add option. In the edit-mode empty state (Task 8, "Add a car to record…"), add `<Button variant="outline" onClick={() => setAddingCar(true)}>Add car</Button>`. Render once near the panel:

```tsx
{
  addingCar && layout && (
    <AddCarDialog
      open
      onOpenChange={setAddingCar}
      track={track}
      layout={layout}
      corners={corners}
      carClasses={data.carClasses ?? []}
      onAdded={(guideId) => {
        setAddingCar(false);
        setParams({ guide: guideId });
      }}
    />
  );
}
```

Put it inside the `panel` fragment so it is rendered in all three shell branches.

- [ ] **Step 10: Run tests**

Run: `pnpm --filter web test src/features/track-view && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/track-view
git commit -m "feat(web): add a car from the track view, empty or from an AI guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Practice card notes and the generated line on the diagram

**Files:**

- Modify: `apps/web/src/features/practice/practice-card.tsx` (new `notes` prop)
- Modify: `apps/web/src/features/practice/diagram-geometry.ts` (accept `line`, report `lineSource`)
- Modify: `apps/web/src/features/practice/corner-diagram.tsx` (`data-source`)
- Modify: `apps/web/src/features/practice/practice-page.tsx`
- Test: `apps/web/src/features/practice/practice-card.test.tsx`, `apps/web/src/features/practice/diagram-geometry.test.ts`

**Interfaces:**

- Consumes: `cornerLine` (Task 3).
- Produces:
  - `PracticeCardProps.notes?: { car: string; corner: string; mistakes: string[] } | null`
  - `DiagramInput.line?: Point[] | null` (path coordinates; wins over `racingLine`), `Diagram.lineSource: "car" | "layout" | null`.

- [ ] **Step 1: Write the failing tests**

In `practice-card.test.tsx` add:

```tsx
it("shows car notes first, then corner notes, and expands to the mistakes", async () => {
  render(
    <PracticeCard
      {...props({
        notes: { car: "Brake at 120 in the MX-5", corner: "Bumpy entry", mistakes: ["Early apex"] },
      })}
    />,
  );
  const notes = screen.getByTestId("practice-notes");
  expect(notes).toHaveTextContent(/Brake at 120 in the MX-5.*Bumpy entry/);
  expect(screen.queryByText("Early apex")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "More notes" }));
  expect(screen.getByText("Early apex")).toBeInTheDocument();
});

it("shows corner notes even without a guide", () => {
  render(
    <PracticeCard {...props({ guide: null, notes: { car: "", corner: "Bumpy", mistakes: [] } })} />,
  );
  expect(screen.getByTestId("practice-notes")).toHaveTextContent("Bumpy");
});

it("has no notes area when there are no notes", () => {
  render(<PracticeCard {...props({ notes: { car: "", corner: "", mistakes: [] } })} />);
  expect(screen.queryByTestId("practice-notes")).not.toBeInTheDocument();
});
```

(Add `import userEvent from "@testing-library/user-event";` at the top.)

In `diagram-geometry.test.ts` add (reuse the file's existing path fixture; read the file and use its square/outline constant and `lengthMeters`):

```ts
it("draws a car's generated line in place of the layout's", () => {
  const line = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ];
  const d = cornerDiagram({ path, lengthMeters, corners: [{ apex: 0.3 }], line });
  expect(d.lineSource).toBe("car");
  expect(d.racingLine).toHaveLength(2);
});
```

and assert `lineSource` in an existing racing-line case (`"layout"`) and a no-line case (`null`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test src/features/practice`
Expected: FAIL.

- [ ] **Step 3: Implement the diagram change**

In `diagram-geometry.ts`: add to `DiagramInput`

```ts
  /** A car's generated line (path coordinates); drawn instead of `racingLine`. */
  line?: Point[] | null;
```

add to `Diagram` `lineSource: "car" | "layout" | null;`, destructure `line` in `cornerDiagram`, and replace the returned `racingLine` with:

```ts
    racingLine: line
      ? line.map(orient)
      : racingLine
        ? sliceNear(racingLine, raw[0]!, raw[raw.length - 1]!).map(orient)
        : null,
    lineSource: line ? "car" : racingLine ? "layout" : null,
```

In `schematicDiagram`'s return add `lineSource: null`.

In `corner-diagram.tsx`, on the racing line `<path>` add `data-source={diagram.lineSource ?? undefined}`.

- [ ] **Step 4: Implement the notes area**

In `practice-card.tsx`: add the prop to `PracticeCardProps`:

```ts
  /** Car notes, corner notes and common mistakes for this step. */
  notes?: { car: string; corner: string; mistakes: string[] } | null;
```

Destructure `notes`, and right after the closing of the `guide === null ? … : …` expression (still inside the left column `div`) add:

```tsx
<PracticeNotes notes={notes ?? null} />
```

and at the bottom of the file:

```tsx
function PracticeNotes({
  notes,
}: {
  notes: { car: string; corner: string; mistakes: string[] } | null;
}) {
  const [open, setOpen] = useState(false);
  if (!notes) return null;
  const parts = [notes.car.trim(), notes.corner.trim()].filter(Boolean);
  if (parts.length === 0 && notes.mistakes.length === 0) return null;
  return (
    <div
      data-testid="practice-notes"
      data-no-nav
      className="shrink-0 rounded-2xl bg-surface p-[calc(0.75rem*var(--practice-scale,1))] text-[calc(clamp(0.95rem,2.6vmin,1.4rem)*var(--practice-scale,1))]"
    >
      <div className={open ? "space-y-2" : "line-clamp-3 space-y-2"}>
        {parts.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
      {open && notes.mistakes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-muted">
          {notes.mistakes.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-1 text-sm text-muted underline"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "Fewer notes" : "More notes"}
      </button>
    </div>
  );
}
```

Add `useState` to the React import (`import { useState, type ReactNode } from "react";`) and `"use client";` at the top of the file if it isn't there.

- [ ] **Step 5: Wire the page**

In `practice-page.tsx`, import `cornerLine` from `@/features/track-view/geometry/corner-line`. In `diagramFor`, after building `positions`, before `cornerDiagram(...)`:

```ts
const hasCarPoints = s.corners.some((_, i) => {
  const l = guides[i]?.line;
  return l != null && (l.turnInAt ?? l.apexAt ?? l.exitAt) != null;
});
const generated = hasCarPoints
  ? cornerLine({
      path: outline,
      lengthMeters: layout.lengthMeters,
      corners: s.corners.map((c, i) => ({
        direction: c.direction,
        turnIn: positions[i]!.turnIn ?? null,
        apex: positions[i]!.apex,
        exit: positions[i]!.exit ?? null,
      })),
    })
  : null;
```

and pass `line: generated?.points ?? null` to `cornerDiagram`.

Pass notes to the card:

```tsx
        notes={{
          car: step.corners
            .map((c) => (session.guide ? (session.guideFor(c.id)?.notes ?? "") : ""))
            .filter(Boolean)
            .join("\n"),
          corner: step.corners.map((c) => c.notes).filter(Boolean).join("\n"),
          mistakes: step.corners.flatMap((c) => c.commonMistakes),
        }}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter web test src/features/practice && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/practice
git commit -m "feat(web): show notes and the car's line in practice mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Quick note from practice

**Files:**

- Modify: `apps/web/src/features/practice/navigation/use-manual-navigator.ts` (`paused` option)
- Create: `apps/web/src/features/practice/quick-note.tsx`
- Modify: `apps/web/src/features/practice/practice-page.tsx`
- Test: `apps/web/src/features/practice/navigation/use-manual-navigator.test.tsx`, `apps/web/src/features/practice/quick-note.test.tsx`

**Interfaces:**

- Consumes: `useAppendNote(trackId)` (Task 4).
- Produces:
  - `useManualNavigator({ …, paused?: boolean })` — while `paused`, keys and tap/swipe do nothing.
  - `QuickNote({ trackId, corner, guideId, existing, open, onOpenChange })`.

- [ ] **Step 1: Write the failing navigator test**

In `use-manual-navigator.test.tsx`, give `Harness` a `paused` prop passed to the hook, and add:

```tsx
it("ignores keys and taps while paused", async () => {
  const onExit = vi.fn();
  render(<Harness onExit={onExit} paused />);
  await userEvent.keyboard("{ArrowRight}{Escape}");
  fireEvent.pointerDown(screen.getByTestId("surface"), { clientX: 250, clientY: 50 });
  fireEvent.pointerUp(screen.getByTestId("surface"), { clientX: 250, clientY: 50 });
  expect(screen.getByText("Step 1")).toBeInTheDocument();
  expect(onExit).not.toHaveBeenCalled();
});
```

Harness signature becomes `function Harness({ onExit = vi.fn(), paused = false }: { onExit?: () => void; paused?: boolean })` and passes `paused` into `useManualNavigator`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/practice/navigation`
Expected: FAIL — step advances.

- [ ] **Step 3: Implement `paused`**

In `use-manual-navigator.ts`: add `paused?: boolean;` to `Options`, destructure `paused = false`. In the key effect, start `onKey` with `if (paused) return;` and add `paused` to the effect's dependency list. In `onPointerDown`, set `start.current = paused || matches(...) ? null : {...}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/practice/navigation`
Expected: PASS.

- [ ] **Step 5: Write the failing quick-note test**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { QuickNote } from "./quick-note";

const corner = { id: "c1", number: 4, notes: "" } as Corner;

function setup(guideId: string | null, create = vi.fn().mockResolvedValue({})) {
  const update = vi.fn().mockResolvedValue({});
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider
        repositories={{ cornerGuides: { create }, corners: { update } } as unknown as Repositories}
      >
        <QuickNote
          trackId="t1"
          corner={corner}
          guideId={guideId}
          existing={undefined}
          open
          onOpenChange={onOpenChange}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { create, update, onOpenChange, user: userEvent.setup() };
}

describe("QuickNote", () => {
  it("adds a dated note to the car for this corner", async () => {
    const { create, onOpenChange, user } = setup("g1");
    expect(screen.getByText("Saved to this car’s notes for T4.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Note"), "Braked too late");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.stringMatching(/: Braked too late$/) }),
    );
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("saves to the corner notes without a car, and says so", async () => {
    const { update, user } = setup(null);
    expect(
      screen.getByText("No car selected: saved to the corner notes for T4."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Note"), "Kerb");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(update).toHaveBeenCalledWith("c1", { notes: expect.stringMatching(/: Kerb$/) });
  });

  it("stays open with the text when saving fails", async () => {
    const { onOpenChange, user } = setup("g1", vi.fn().mockRejectedValue(new Error("Disk full")));
    await user.type(screen.getByLabelText("Note"), "Late");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect(screen.getByLabelText("Note")).toHaveValue("Late");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter web test src/features/practice/quick-note.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `quick-note.tsx`**

```tsx
"use client";

import type { Corner, CornerGuide } from "@track-day/schema";
import { useId, useState } from "react";
import { useAppendNote } from "@/features/track-view/edit/use-edit-mutations";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

/** One-field sheet: a dated line on the car's (or the corner's) notes. */
export function QuickNote({
  trackId,
  corner,
  guideId,
  existing,
  open,
  onOpenChange,
}: {
  trackId: string;
  corner: Corner;
  guideId: string | null;
  existing: CornerGuide | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const [text, setText] = useState("");
  const append = useAppendNote(trackId);
  const id = useId();

  return (
    <AlertDialog open={open} onOpenChange={(next) => !append.isPending && onOpenChange(next)}>
      <AlertDialogContent data-theme="practice">
        <AlertDialogTitle>Note for T{corner.number}</AlertDialogTitle>
        <AlertDialogDescription>
          {guideId
            ? `Saved to this car’s notes for T${corner.number}.`
            : `No car selected: saved to the corner notes for T${corner.number}.`}
        </AlertDialogDescription>
        <div className="space-y-1">
          <Label htmlFor={id}>Note</Label>
          <Textarea
            id={id}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-24 text-base"
          />
        </div>
        {append.error && (
          <p role="alert" className="text-sm text-danger">
            Could not save: {append.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={append.isPending}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button
            aria-label="Save note"
            disabled={append.isPending || text.trim() === ""}
            onClick={() =>
              append.mutate(
                { text, corner, guideId, existing },
                {
                  onSuccess: () => {
                    setText("");
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            {append.error ? "Retry" : "Save"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 8: Wire the page**

In `practice-page.tsx`:

```ts
import { QuickNote } from "./quick-note";
// …
const [noting, setNoting] = useState(false);
```

Pass `paused: noting` to `useManualNavigator`, and guard the gamepad: `onAction: (action) => { if (noting) return; action === "next" ? navigator.next() : navigator.prev(); }`.

In `controls`, before `Prev`:

```tsx
<ControlButton onClick={() => setNoting(true)}>Note</ControlButton>
```

and render inside `PracticeShell`, after `PracticeCard`:

```tsx
<QuickNote
  trackId={trackId}
  corner={step.corners[0]!}
  guideId={session.guide?.id ?? null}
  existing={session.guide ? (session.guideFor(step.corners[0]!.id) ?? undefined) : undefined}
  open={noting}
  onOpenChange={setNoting}
/>
```

For a complex, the note goes to its first corner — the title in the sheet says which.

- [ ] **Step 9: Run tests**

Run: `pnpm --filter web test src/features/practice && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/practice
git commit -m "feat(web): jot a quick note from practice mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: End-to-end test and docs

**Files:**

- Create: `apps/web/e2e/editing.spec.ts`
- Create: `docs/adr/007-line-from-points.md`
- Modify: `docs/adr/README.md`, `docs/data-model.md`, `docs/PLAN.md`

- [ ] **Step 1: Write the e2e test**

```ts
import { expect, test } from "@playwright/test";

test("edit a car's corner, place its apex, and see it in practice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();

  // Add a car.
  await page.getByLabel("Car").selectOption("__add__");
  await page.getByLabel("Car name").fill("Mazda MX-5");
  await page.getByLabel("Sim").selectOption("assetto-corsa");
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByLabel("Car").locator("option:checked")).toHaveText(/Mazda MX-5/);

  // Edit T1.
  await page.getByRole("button", { name: "Edit" }).click();
  const t1 = page.getByRole("button", { name: /^Turn 1,/ });
  await t1.click();
  await page.getByLabel("Minimum speed (km/h)").fill("70");
  await page.getByLabel("Gear").fill("2");
  await page.getByLabel("Car notes").fill("Brake before the bridge shadow");
  await page.getByRole("button", { name: "Save car values" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // Place the apex where the T1 marker is (measured now: selecting it panned the map).
  await page.getByRole("button", { name: "Set apex" }).click();
  const box = (await t1.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("[data-testid=car-line]")).toHaveCount(1);

  // Practice from T1 shows the values, the note and the car's line.
  await page.getByRole("link", { name: "Practice from T1" }).click();
  const card = page.getByTestId("practice-card");
  await expect(card).toContainText("70");
  await expect(page.getByTestId("practice-notes")).toContainText("Brake before the bridge shadow");
  await expect(page.locator("[data-testid=diagram-racing-line]")).toHaveAttribute(
    "data-source",
    "car",
  );

  // Quick note, then find it in the track view.
  await page.getByRole("button", { name: "Note" }).click();
  await page.getByLabel("Note").fill("Turn in later");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByTestId("practice-notes")).toContainText("Turn in later");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/tracks\/view\//);
});
```

The marker sits at the label position, which may be offset from the apex by a leader line; the snap still lands on the outline near T1. If the point lands more than 300 m away and a confirm dialog appears, accept it with `page.once("dialog", (d) => d.accept())` before the click.

- [ ] **Step 2: Build and run it**

Run: `pnpm build && pnpm test:e2e -- editing.spec.ts`
Expected: PASS on both Playwright projects. Fix selectors against the real UI if they differ, without weakening what is asserted.

- [ ] **Step 3: Write ADR-007**

`docs/adr/007-line-from-points.md`:

```markdown
# 007. A car's racing line from turn-in, apex and exit

- Status: Accepted
- Date: 2026-10-07

## Context

Users want to mark the line they take through a corner, per car, on a phone or tablet as easily as on a desktop. Positions along the outline already exist (`CornerGuide.line.turnInAt/apexAt/exitAt`), but a line through three centerline points is the centerline. There is no track-width data.

## Decision

- The user places turn-in, apex and exit along the outline (snapped to the nearest point).
- The app offsets each point by half a nominal 12 m width: turn-in and exit to the outside, the apex to the inside. Outside is the opposite side of `Corner.direction`; the outline runs in the driving direction (ADR-005), so the side follows from its tangent.
- A lead-in 40 m before turn-in and a lead-out 40 m after exit, on the outside, then a centripetal Catmull-Rom curve.
- Missing turn-in or exit is estimated (60 m before / 50 m after the apex) and drawn dashed. No apex or no direction: no line.
- A car's generated line is drawn on top of the layout's imported line, which is dimmed; in practice it replaces it.

## Consequences

- No new stored fields; the line is derived on the fly.
- Lines are approximate on wide or narrow tracks. A later step can add a lateral offset per point (dragging across the track) without changing what is stored today.
```

Add a row for ADR-007 to `docs/adr/README.md` in the same format as the others.

- [ ] **Step 4: Update `docs/data-model.md` and `docs/PLAN.md`**

- `data-model.md`, CornerGuide row: after `downshiftTo (practice mode, ADR-006)` add `, notes (free text; in-app edits and practice quick notes)`.
- `PLAN.md`:
  - Under **M2**, add `- [x] Corner notes and common mistakes editing (in-app editing spec, 2026-10-07)` (leave "Corner CRUD + ordering" unticked).
  - Under **M4**, tick `- [x] Guide + CornerGuide editor` and add `- [x] Add a car (empty or from an AI guide) from the track view`.
  - Under **M1.6** or v2, add `- [x] Car racing line from turn-in/apex/exit points (ADR-007)`.
  - In **10. Decisions log**, add `- **Backend:** still deferred. Editing and practice happen on one device, so IndexedDB plus JSON backup is enough (2026-10-07).`

- [ ] **Step 5: Full check**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/editing.spec.ts docs
git commit -m "test(web): cover in-app editing end to end; document the line ADR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
