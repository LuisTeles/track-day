import type { Corner, CornerComplex, ReferenceVideo } from "@track-day/schema";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { YTPlayerOptions } from "@/features/video/youtube-api";
import { useManualNavigator } from "./navigation/use-manual-navigator";
import { buildSteps, type PracticeStep } from "./navigation/steps";

const loadYouTubeApi = vi.fn();
vi.mock("@/features/video/youtube-api", () => ({
  loadYouTubeApi: (...a: unknown[]) => loadYouTubeApi(...a),
}));

import { FollowVideo } from "./follow-video";

/** Fake YT player. With `lag`, a seek lands only when the test calls `land()`. */
class FakePlayer {
  static instances: FakePlayer[] = [];
  static lag = false;
  calls: [string, ...unknown[]][] = [];
  time = 0;
  queued: number[] = [];
  state = -1;
  constructor(
    public el: HTMLElement,
    public opts: YTPlayerOptions,
  ) {
    FakePlayer.instances.push(this);
  }
  seekTo(s: number) {
    this.calls.push(["seekTo", s]);
    if (FakePlayer.lag) this.queued.push(s);
    else this.time = s;
  }
  land() {
    this.time = this.queued.shift()!;
  }
  playVideo() {
    this.calls.push(["playVideo"]);
  }
  pauseVideo() {
    this.calls.push(["pauseVideo"]);
  }
  getCurrentTime() {
    return this.time;
  }
  getPlayerState() {
    return this.state;
  }
  destroy() {
    this.calls.push(["destroy"]);
  }
}

const player = () => FakePlayer.instances[FakePlayer.instances.length - 1]!;
const seeks = () =>
  player()
    .calls.filter((c) => c[0] === "seekTo")
    .map((c) => c[1]);

const corner = (number: number): Corner => ({
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
  distanceFromStartMeters: null,
  notes: "",
  commonMistakes: [],
});

const CORNERS = [1, 2, 3, 4, 5].map(corner);
// T4 is not marked.
const MARKS = [
  { cornerId: "c1", sec: 10 },
  { cornerId: "c2", sec: 20 },
  { cornerId: "c3", sec: 30 },
  { cornerId: "c5", sec: 50 },
];
const YOUTUBE: ReferenceVideo = {
  source: "youtube",
  youtubeId: "dQw4w9WgXcQ",
  lapStartSec: 5,
  lapEndSec: null,
  marks: MARKS,
};
const FILE: ReferenceVideo = {
  source: "file",
  file: { name: "lap.mp4", sizeBytes: 3, durationSec: 90 },
  lapStartSec: 5,
  lapEndSec: null,
  marks: MARKS,
};

function Harness({
  video,
  steps = buildSteps(CORNERS, [], "corner"),
}: {
  video: ReferenceVideo;
  steps?: PracticeStep[];
}) {
  const [current, setCurrent] = useState(0);
  const [on, setOn] = useState(true);
  const { navigator } = useManualNavigator({ count: steps.length, current, onChange: setCurrent });
  return (
    <>
      <p data-testid="step">{steps[current]!.corners.map((c) => `T${c.number}`).join("–")}</p>
      <button type="button" onClick={navigator.prev}>
        Prev
      </button>
      <button type="button" onClick={navigator.next}>
        Next
      </button>
      <button type="button" onClick={() => setOn(false)}>
        Stop following
      </button>
      {on && (
        <FollowVideo
          video={video}
          title="Reference video"
          steps={steps}
          current={current}
          onStep={navigator.goTo}
        />
      )}
    </>
  );
}

const step = () => screen.getByTestId("step").textContent;
const tick = () => act(() => vi.advanceTimersByTimeAsync(300));

async function mountYouTube(steps?: PracticeStep[]) {
  const utils = render(<Harness video={YOUTUBE} steps={steps} />);
  await act(() => vi.advanceTimersByTimeAsync(0)); // the API promise resolves
  expect(FakePlayer.instances).toHaveLength(1);
  act(() => player().opts.events!.onReady!({ target: player() as never }));
  return utils;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakePlayer.instances = [];
  FakePlayer.lag = false;
  loadYouTubeApi.mockResolvedValue({ Player: FakePlayer });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("FollowVideo", () => {
  it("starts the video at the current corner's mark once the player is ready", async () => {
    await mountYouTube();
    expect(seeks()).toEqual([10]);
  });

  it("moves the card when the video passes a mark, without seeking", async () => {
    await mountYouTube();
    player().time = 15;
    await tick();
    expect(step()).toBe("T1");
    player().time = 21;
    await tick();
    expect(step()).toBe("T2");
    player().time = 31;
    await tick();
    expect(step()).toBe("T3");
    expect(seeks()).toEqual([10]);
  });

  it("Next and Prev seek to the corner's mark; the card doesn't bounce back", async () => {
    await mountYouTube();
    player().time = 12;
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(step()).toBe("T2");
    expect(seeks()).toEqual([10, 20]);
    await tick();
    await tick();
    expect(step()).toBe("T2");
    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    expect(step()).toBe("T1");
    expect(seeks()).toEqual([10, 20, 10]);
    await tick();
    expect(step()).toBe("T1");
    // Seeking never starts playback.
    expect(player().calls.some((c) => c[0] === "playVideo")).toBe(false);
  });

  it("ignores a stale time from an earlier seek that lands late", async () => {
    await mountYouTube();
    FakePlayer.lag = true;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(step()).toBe("T3");
    expect(seeks()).toEqual([10, 20, 30]);
    player().land(); // the T2 seek lands: the poll would read T2
    await tick();
    expect(step()).toBe("T3");
    player().land(); // then T3
    await tick();
    expect(step()).toBe("T3");
    // Playing on still follows.
    player().time = 51;
    await tick();
    expect(step()).toBe("T5");
  });

  it("an unmarked corner changes the card without seeking", async () => {
    await mountYouTube();
    player().time = 31;
    await tick();
    expect(step()).toBe("T3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(step()).toBe("T4");
    await tick();
    await tick();
    expect(step()).toBe("T4");
    expect(seeks()).toEqual([10]);
  });

  it("by complex: seeks to the step's first marked corner", async () => {
    const complex: CornerComplex = {
      id: "k",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      layoutId: "l",
      name: "S",
      cornerIds: ["c4", "c5"],
      notes: "",
    };
    await mountYouTube(buildSteps(CORNERS, [complex], "complex"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(step()).toBe("T4–T5");
    expect(seeks().at(-1)).toBe(50);
    await tick();
    expect(step()).toBe("T4–T5");
    // The video passing T2 brings the card to T2's step.
    player().time = 25;
    await tick();
    expect(step()).toBe("T2");
  });

  it("stops the player when following is switched off", async () => {
    await mountYouTube();
    fireEvent.click(screen.getByRole("button", { name: "Stop following" }));
    expect(player().calls.at(-1)).toEqual(["destroy"]);
  });

  describe("a file video", () => {
    const create = vi.fn(() => "blob:lap");
    const revoke = vi.fn();
    beforeEach(() => {
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    });
    const pick = (name: string, bytes = "abc") =>
      fireEvent.change(screen.getByLabelText("Choose a video file"), {
        target: { files: [new File([bytes], name, { type: "video/mp4" })] },
      });

    it("plays the same file straight away, and releases it when switched off", () => {
      const { container } = render(<Harness video={FILE} />);
      expect(container.querySelector("video")).toBeNull();
      pick("lap.mp4");
      expect(container.querySelector("video")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Stop following" }));
      expect(container.querySelector("video")).toBeNull();
      expect(revoke).toHaveBeenCalledWith("blob:lap");
    });

    it("asks before using a different file with the marks, and offers nothing else", () => {
      const { container } = render(<Harness video={FILE} />);
      pick("other.mp4");
      expect(container.querySelector("video")).toBeNull();
      expect(screen.getByText(/That's a different file \(other\.mp4\)/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Start new marks" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Use with these marks" }));
      expect(container.querySelector("video")).not.toBeNull();
    });

    it("explains a file that can't be played and shows the picker again", () => {
      const { container } = render(<Harness video={FILE} />);
      pick("lap.mp4");
      fireEvent.error(container.querySelector("video")!);
      expect(screen.getByRole("alert")).toHaveTextContent("This file can't be played");
      expect(screen.getByLabelText("Choose a video file")).toBeInTheDocument();
    });
  });
});
