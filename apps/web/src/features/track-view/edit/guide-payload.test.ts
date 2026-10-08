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
      schemaVersion: 2,
      kind: "guide",
      guide: {},
      corners: [{ cornerNumber: 1 }, { cornerNumber: 99 }],
    });
    expect(missingCorners(payload, corners)).toEqual([99]);
  });
});
