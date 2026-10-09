import type { Corner, ReferenceVideo } from "@track-day/schema";
import { act, render, screen } from "@testing-library/react";
import { useCallback, useState, type RefObject } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockLayout } from "@/test/dom";
import { TrackCanvas } from "../track-view/track-canvas";
import type { VideoPlayerHandle } from "./player";
import { VideoDotLayer } from "./video-dot-layer";

beforeAll(() => mockLayout());
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const corner = (number: number, distance: number | null): Corner => ({
  id: `c${number}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  layoutId: "l",
  number,
  name: null,
  direction: "left",
  type: null,
  elevation: null,
  camber: null,
  pathPosition: null,
  labelOffset: null,
  order: number - 1,
  distanceFromStartMeters: distance,
  notes: "",
  commonMistakes: [],
});

const CORNERS = [corner(1, 100), corner(2, 200), corner(3, null)];
const LAYOUT = { lengthMeters: 400 };
const video = (
  extra: Partial<Pick<ReferenceVideo, "lapStartSec" | "lapEndSec" | "marks">> = {},
): ReferenceVideo => ({
  source: "youtube",
  youtubeId: "dQw4w9WgXcQ",
  lapStartSec: 0,
  lapEndSec: null,
  marks: [
    { cornerId: "c1", sec: 10 },
    { cornerId: "c2", sec: 20 },
  ],
  ...extra,
});

function setup(
  v: ReferenceVideo | null,
  opts: { corners?: Corner[]; active?: boolean; outline?: string } = {},
) {
  let time = 0;
  const player = { current: { currentTime: () => time } as unknown as VideoPlayerHandle };
  const onCorner = vi.fn();
  const renders = { parent: 0, sibling: 0 };
  function Sibling() {
    renders.sibling++;
    return null;
  }
  function Parent() {
    renders.parent++;
    const [, setCorner] = useState<string | null>(null);
    const report = useCallback((id: string | null) => {
      onCorner(id);
      setCorner(id);
    }, []);
    return (
      <TrackCanvas
        outlinePath={opts.outline ?? "M 0 0 L 100 0 L 100 100 L 0 100 Z"}
        label="Map"
        overlay={(ctx) => (
          <>
            <VideoDotLayer
              ctx={ctx}
              playerRef={player as RefObject<VideoPlayerHandle | null>}
              active={opts.active ?? true}
              video={v}
              corners={opts.corners ?? CORNERS}
              layout={LAYOUT}
              onCornerChange={report}
            />
            <Sibling />
          </>
        )}
      />
    );
  }
  render(<Parent />);
  const tick = (sec: number) => {
    time = sec;
    act(() => void vi.advanceTimersByTime(250));
  };
  return { tick, onCorner, renders };
}

const dotTransform = () => screen.queryByTestId("video-dot")?.style.transform ?? null;

describe("VideoDotLayer", () => {
  it("moves the dot with the video without re-rendering its parent or sibling overlays", () => {
    // Warm up: first ticks settle the corner state.
    const { tick, renders } = setup(video());
    tick(11);
    const before = { ...renders };
    const seen = new Set<string | null>([dotTransform()]);
    for (const sec of [12, 13, 14, 15]) {
      tick(sec);
      seen.add(dotTransform());
    }
    expect(seen.size).toBe(5);
    expect(renders).toEqual(before);
  });

  it("reports the current corner only when it changes", () => {
    const { tick, onCorner } = setup(video());
    tick(5);
    tick(11);
    tick(12);
    tick(21);
    tick(22);
    expect(onCorner.mock.calls.map((c) => c[0])).toEqual([null, "c1", "c2"]);
  });

  it("hides the dot when marks are out of lap order", () => {
    const { tick } = setup(
      video({
        marks: [
          { cornerId: "c1", sec: 20 },
          { cornerId: "c2", sec: 10 },
        ],
      }),
    );
    tick(15);
    expect(dotTransform()).toBeNull();
  });

  it("hides the dot with fewer than two anchors", () => {
    const { tick } = setup(video({ lapStartSec: null, marks: [{ cornerId: "c1", sec: 10 }] }));
    tick(10);
    expect(dotTransform()).toBeNull();
  });

  it("hides the dot for marks on corners that can't be placed", () => {
    const { tick } = setup(
      video({
        lapStartSec: null,
        marks: [
          { cornerId: "c3", sec: 10 },
          { cornerId: "c1", sec: 12 },
        ],
      }),
    );
    tick(11);
    expect(dotTransform()).toBeNull();
  });

  it("shows nothing while inactive or without a video", () => {
    const a = setup(video(), { active: false });
    a.tick(15);
    expect(dotTransform()).toBeNull();
  });

  it("follows the lap and hides after the last anchor", () => {
    const { tick } = setup(video());
    tick(15);
    expect(dotTransform()).toMatch(/^translate\(/);
    tick(2000);
    expect(dotTransform()).toBeNull();
  });
});
