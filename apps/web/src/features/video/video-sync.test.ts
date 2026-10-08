import type { Corner, ReferenceVideo } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import {
  cornerAt,
  formatVideoTime,
  lapFractionAt,
  nextToMark,
  markOrderProblems,
  outOfOrder,
  videoAnchors,
} from "./video-sync";

const corner = (id: string, number: number, order: number, pathPosition: number | null) =>
  ({ id, number, order, pathPosition, distanceFromStartMeters: null }) as unknown as Corner;

const corners = [
  corner("c1", 1, 1, 0.1),
  corner("c2", 2, 2, 0.3),
  corner("c3", 3, 3, 0.5),
  corner("c4", 4, 4, 0.8),
];
const layout = { lengthMeters: 1000 };

const video = (
  marks: { cornerId: string; sec: number }[],
  lapStartSec: number | null = null,
  lapEndSec: number | null = null,
): ReferenceVideo => ({
  source: "youtube",
  youtubeId: "dQw4w9WgXcQ",
  lapStartSec,
  lapEndSec,
  marks,
});

describe("videoAnchors", () => {
  it("puts the start line first, then marks sorted by time", () => {
    const v = video(
      [
        { cornerId: "c2", sec: 20 },
        { cornerId: "c1", sec: 10 },
      ],
      2,
    );
    expect(videoAnchors(v, corners, layout)).toEqual([
      { sec: 2, fraction: 0 },
      { sec: 10, fraction: 0.1 },
      { sec: 20, fraction: 0.3 },
    ]);
  });
  it("sorts a start mark by time, not first", () => {
    const v = video([{ cornerId: "c1", sec: 10 }], 15);
    expect(videoAnchors(v, corners, layout)).toEqual([
      { sec: 10, fraction: 0.1 },
      { sec: 15, fraction: 0 },
    ]);
  });
  it("skips unknown corners and corners without a fraction", () => {
    const cs = [...corners, corner("c5", 5, 5, null)];
    const v = video([
      { cornerId: "nope", sec: 5 },
      { cornerId: "c5", sec: 6 },
      { cornerId: "c1", sec: 10 },
    ]);
    expect(videoAnchors(v, cs, layout)).toEqual([{ sec: 10, fraction: 0.1 }]);
  });
});

describe("lapFractionAt", () => {
  const a = (sec: number, fraction: number) => ({ sec, fraction });
  it("interpolates linearly", () => {
    expect(lapFractionAt(15, [a(10, 0.2), a(20, 0.4)], null)).toBeCloseTo(0.3);
  });
  it("unwraps across the start line", () => {
    expect(lapFractionAt(15, [a(10, 0.9), a(20, 0.1)], null)).toBeCloseTo(0);
    expect(lapFractionAt(12, [a(10, 0.9), a(20, 0.1)], null)).toBeCloseTo(0.94);
  });
  it("returns null outside the anchors or with too few", () => {
    const anchors = [a(10, 0.2), a(20, 0.4)];
    expect(lapFractionAt(9.9, anchors, null)).toBeNull();
    expect(lapFractionAt(20.1, anchors, null)).toBeNull();
    expect(lapFractionAt(10, anchors, null)).toBeCloseTo(0.2);
    expect(lapFractionAt(20, anchors, null)).toBeCloseTo(0.4);
    expect(lapFractionAt(15, [], null)).toBeNull();
    expect(lapFractionAt(15, [a(10, 0.2)], null)).toBeNull();
  });
  it("runs the last segment to the end of the lap", () => {
    const anchors = [a(0, 0), a(10, 0.5)];
    expect(lapFractionAt(15, anchors, 20)).toBeCloseTo(0.75);
    expect(lapFractionAt(20, anchors, 20)).toBeCloseTo(0);
    expect(lapFractionAt(20.5, anchors, 20)).toBeNull();
  });
  it("closes the lap at the line even when the start is unmarked", () => {
    const anchors = [a(20, 0.5), a(30, 0.8)];
    expect(lapFractionAt(35, anchors, 40)).toBeCloseTo(0.9);
    expect(lapFractionAt(40, anchors, 40)).toBeCloseTo(0);
    const past = [a(10, 0.9), a(20, 0.1)];
    expect(lapFractionAt(25, past, 30)).toBeCloseTo(0.55);
    expect(lapFractionAt(30, past, 30)).toBeCloseTo(0);
  });
  it("never returns NaN for equal times", () => {
    const r = lapFractionAt(10, [a(10, 0.2), a(10, 0.4), a(20, 0.6)], null);
    expect(r).toBeCloseTo(0.4);
    expect(Number.isNaN(lapFractionAt(10, [a(10, 0.2), a(10, 0.4)], null))).toBe(false);
  });
});

describe("cornerAt", () => {
  const marks = [
    { cornerId: "c2", sec: 20 },
    { cornerId: "c1", sec: 10 },
  ];
  it("finds the latest mark at or before sec", () => {
    expect(cornerAt(5, marks)).toBeNull();
    expect(cornerAt(10, marks)).toBe("c1");
    expect(cornerAt(19.9, marks)).toBe("c1");
    expect(cornerAt(25, marks)).toBe("c2");
    expect(cornerAt(5, [])).toBeNull();
  });
});

describe("nextToMark", () => {
  it("goes start, corners in lap order, finish, then null", () => {
    const shuffled = [corners[2]!, corners[0]!, corners[3]!, corners[1]!];
    expect(nextToMark(video([]), shuffled)).toBe("start");
    expect(nextToMark(video([], 1), shuffled)).toBe("c1");
    expect(nextToMark(video([{ cornerId: "c1", sec: 5 }], 1), shuffled)).toBe("c2");
    const all = corners.map((c, i) => ({ cornerId: c.id, sec: 5 + i }));
    expect(nextToMark(video(all, 1), shuffled)).toBe("finish");
    expect(nextToMark(video(all, 1, 30), shuffled)).toBeNull();
  });
  it("skips already-marked corners", () => {
    expect(
      nextToMark(
        video(
          [
            { cornerId: "c1", sec: 5 },
            { cornerId: "c3", sec: 9 },
          ],
          1,
        ),
        corners,
      ),
    ).toBe("c2");
  });
});

describe("outOfOrder", () => {
  it("is empty when valid or unmarked", () => {
    expect(outOfOrder(video([]), corners)).toEqual([]);
    expect(
      outOfOrder(video(corners.map((c, i) => ({ cornerId: c.id, sec: i * 5 }))), corners),
    ).toEqual([]);
  });
  it("names corners earlier than the previous marked corner", () => {
    const v = video([
      { cornerId: "c1", sec: 10 },
      { cornerId: "c2", sec: 20 },
      { cornerId: "c3", sec: 40 },
      { cornerId: "c4", sec: 35 },
    ]);
    expect(outOfOrder(v, corners)).toEqual([4]);
  });
});

describe("formatVideoTime", () => {
  it("formats m:ss.t", () => {
    expect(formatVideoTime(83.4)).toBe("1:23.4");
    expect(formatVideoTime(5)).toBe("0:05.0");
    expect(formatVideoTime(0)).toBe("0:00.0");
    expect(formatVideoTime(59.96)).toBe("1:00.0");
    expect(formatVideoTime(-3)).toBe("0:00.0");
  });
});

describe("markOrderProblems", () => {
  const ordered = corners.map((c, i) => ({ cornerId: c.id, sec: 10 + i * 5 }));
  it("is empty when valid or unmarked", () => {
    expect(markOrderProblems(video([]), corners)).toEqual([]);
    expect(markOrderProblems(video(ordered, 5, 40), corners)).toEqual([]);
  });
  it("names out-of-order corners", () => {
    const v = video([
      { cornerId: "c3", sec: 40 },
      { cornerId: "c4", sec: 35 },
    ]);
    expect(markOrderProblems(v, corners)).toEqual(["T4 is marked before the corner ahead of it."]);
  });
  it("flags a start line marked after the first corner", () => {
    expect(markOrderProblems(video(ordered, 12), corners)).toEqual([
      "The start line is marked after T1.",
    ]);
  });
  it("flags a finish line marked before the last corner", () => {
    expect(markOrderProblems(video(ordered, 5, 20), corners)).toEqual([
      "The finish line is marked before T4.",
    ]);
  });
});
