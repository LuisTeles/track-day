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

describe("buildTrackGeometry on a dense network", () => {
  /** Two parallel 2 km straights joined by `rungs` link roads, no start line: worst case for the search. */
  function ladder(rungs: number): OsmElement[] {
    const elements: OsmElement[] = [];
    const lonAt = (i: number) => (0.018 * i) / (rungs - 1);
    for (let i = 0; i < rungs; i++) {
      elements.push({ type: "node", id: 1000 + i, lat: 0, lon: lonAt(i) });
      elements.push({ type: "node", id: 2000 + i, lat: 0.0009, lon: lonAt(i) });
    }
    const way = (id: number, nodes: number[]): OsmElement => ({
      type: "way",
      id,
      nodes,
      tags: { highway: "raceway" },
    });
    elements.push(
      way(
        1,
        Array.from({ length: rungs }, (_, i) => 1000 + i),
      ),
    );
    elements.push(
      way(
        2,
        Array.from({ length: rungs }, (_, i) => 2000 + i),
      ),
    );
    for (let i = 0; i < rungs; i++) elements.push(way(10 + i, [1000 + i, 2000 + i]));
    return elements;
  }

  it("stays responsive and says the network was too complex to search fully", () => {
    const started = performance.now();
    const r = buildTrackGeometry(ladder(24), { lengthMeters: 4800, direction: "clockwise" });
    expect(performance.now() - started).toBeLessThan(1500);
    const notes = r.ok ? r.warnings.join(" ") : "";
    expect(r.ok ? notes : "no-loop").toMatch(/too complex|no-loop/);
  });
});

describe("choosing the start line", () => {
  const wrap = (f: number) => ((f % 1) + 1) % 1;

  it("reports an unknown start when OSM has no start line or corner tags (Monza)", () => {
    const r = ok(
      buildTrackGeometry(fixture("monza"), { lengthMeters: 5793, direction: "clockwise" }),
    );
    expect(Math.abs(r.loopLengthMeters - 5793) / 5793).toBeLessThan(0.02);
    expect(r.start).toBe("arbitrary");
  });

  it("restarts the loop at the chosen fraction, shifting corner positions with it", () => {
    const options = { lengthMeters: 4309, direction: "anticlockwise" as const };
    const base = ok(buildTrackGeometry(fixture("interlagos"), options));
    const moved = ok(buildTrackGeometry(fixture("interlagos"), { ...options, startAt: 0.3 }));

    expect(moved.start).toBe("chosen");
    expect(moved.outlinePath).not.toBe(base.outlinePath);
    for (const c of base.corners) {
      const after = moved.corners.find((m) => m.number === c.number)!.position;
      const expected = wrap(c.position - 0.3);
      const diff = Math.min(Math.abs(after - expected), 1 - Math.abs(after - expected));
      expect(diff).toBeLessThan(0.01);
    }
  });

  it("treats startAt 0 as keeping the current start", () => {
    const options = { lengthMeters: 5793, direction: "clockwise" as const };
    const base = ok(buildTrackGeometry(fixture("monza"), options));
    const same = ok(buildTrackGeometry(fixture("monza"), { ...options, startAt: 0 }));
    expect(same.outlinePath).toBe(base.outlinePath);
  });
});
