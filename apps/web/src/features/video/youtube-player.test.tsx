import { createRef, StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoPlayerHandle } from "./player";
import { controlsAfterReady } from "@/test/youtube";
import type { YTPlayerOptions } from "./youtube-api";

const loadYouTubeApi = vi.fn();
vi.mock("./youtube-api", () => ({ loadYouTubeApi: (...a: unknown[]) => loadYouTubeApi(...a) }));

import { YouTubePlayer } from "./youtube-player";

class FakePlayer {
  static instances: FakePlayer[] = [];
  calls: [string, ...unknown[]][] = [];
  time = 0;
  state = -1;
  iframe = document.createElement("iframe");
  /** Fires onReady; until then the control methods don't exist, as on the real API. */
  ready: () => void;
  constructor(
    public el: HTMLElement,
    public opts: YTPlayerOptions,
  ) {
    FakePlayer.instances.push(this);
    this.ready = controlsAfterReady(this, opts);
  }
  seekTo(s: number, a: boolean) {
    this.calls.push(["seekTo", s, a]);
    this.time = s;
    // Like the real player: seeking an unstarted, cued or ended video starts it.
    if (this.state === -1 || this.state === 5 || this.state === 0) this.state = 1;
  }
  playVideo() {
    this.calls.push(["playVideo"]);
    this.state = 1;
  }
  pauseVideo() {
    this.calls.push(["pauseVideo"]);
    this.state = 2;
  }
  getCurrentTime() {
    return this.time;
  }
  getPlayerState() {
    return this.state;
  }
  getIframe() {
    return this.iframe;
  }
  destroy() {
    this.calls.push(["destroy"]);
  }
}

const last = () => FakePlayer.instances[FakePlayer.instances.length - 1]!;

beforeEach(() => {
  FakePlayer.instances = [];
  loadYouTubeApi.mockResolvedValue({ Player: FakePlayer });
});
afterEach(() => vi.clearAllMocks());

async function mount({ ready = true, ...extra }: { onReady?: () => void; ready?: boolean } = {}) {
  const ref = createRef<VideoPlayerHandle>();
  const utils = render(
    <YouTubePlayer ref={ref} videoId="dQw4w9WgXcQ" title="Onboard" {...extra} />,
  );
  await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
  if (ready) act(() => last().ready());
  return { ref, ...utils };
}

describe("YouTubePlayer", () => {
  it("creates the player with the nocookie host, title and ready callback", async () => {
    const onReady = vi.fn();
    await mount({ onReady, ready: false });
    expect(last().opts.videoId).toBe("dQw4w9WgXcQ");
    expect(last().opts.host).toBe("https://www.youtube-nocookie.com");
    expect(last().opts.playerVars).toMatchObject({ rel: 0, modestbranding: 1, playsinline: 1 });
    expect(onReady).not.toHaveBeenCalled();
    act(() => last().ready());
    expect(onReady).toHaveBeenCalled();
    expect(last().iframe.title).toBe("Onboard");
  });

  it("has a safe handle before the player is ready (its methods don't exist yet)", async () => {
    const { ref } = await mount({ ready: false });
    expect(() => ref.current!.currentTime()).not.toThrow();
    expect(ref.current!.currentTime()).toBe(0);
    expect(() => ref.current!.seek(5)).not.toThrow();
    expect(() => ref.current!.play()).not.toThrow();
    expect(() => ref.current!.pause()).not.toThrow();
    expect(ref.current!.isPlaying()).toBe(false);
    act(() => last().ready());
    act(() => ref.current!.seek(7));
    expect(ref.current!.currentTime()).toBe(7);
  });

  it("exposes a handle that seeks, plays and pauses", async () => {
    const { ref } = await mount();
    act(() => ref.current!.seek(7));
    expect(last().calls).toContainEqual(["seekTo", 7, true]);
    expect(ref.current!.currentTime()).toBe(7);
    expect(ref.current!.isPlaying()).toBe(false);
    act(() => ref.current!.play());
    expect(ref.current!.isPlaying()).toBe(true);
    act(() => ref.current!.pause());
    expect(ref.current!.isPlaying()).toBe(false);
  });

  it.each([-1, 5, 0])(
    "a seek on an unstarted, cued or ended video (%i) doesn't start playback",
    async (state) => {
      const { ref } = await mount();
      last().state = state;
      act(() => ref.current!.seek(12));
      expect(last().calls).toEqual([["seekTo", 12, true], ["pauseVideo"]]);
      expect(ref.current!.isPlaying()).toBe(false);
    },
  );

  it("a seek while playing or paused leaves playback as it was", async () => {
    const { ref } = await mount();
    last().state = 1;
    act(() => ref.current!.seek(12));
    expect(ref.current!.isPlaying()).toBe(true);
    last().state = 2;
    act(() => ref.current!.seek(15));
    expect(ref.current!.isPlaying()).toBe(false);
    expect(last().calls.filter((c) => c[0] === "pauseVideo")).toEqual([]);
  });

  it("destroys the player on unmount", async () => {
    const { unmount } = await mount();
    unmount();
    expect(last().calls).toContainEqual(["destroy"]);
  });

  it.each([
    [2, "This video isn't available."],
    [100, "This video isn't available."],
    [101, "The owner doesn't allow this video in other apps."],
    [150, "The owner doesn't allow this video in other apps."],
  ])("maps error %i to a message and a Watch on YouTube link", async (code, message) => {
    await mount();
    act(() => last().opts.events!.onError!({ data: code }));
    expect(screen.getByText(message)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Watch on YouTube/ });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("shows the offline message with Try again when the loader fails, and retries", async () => {
    loadYouTubeApi.mockRejectedValueOnce(new Error("timeout"));
    render(<YouTubePlayer videoId="dQw4w9WgXcQ" title="Onboard" />);
    expect(await screen.findByText("The video needs an internet connection.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Watch on YouTube/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    expect(screen.queryByText("The video needs an internet connection.")).not.toBeInTheDocument();
  });

  it("clears the error and builds a new player when the videoId changes", async () => {
    const { rerender } = render(<YouTubePlayer videoId="dQw4w9WgXcQ" title="Onboard" />);
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    const old = last();
    act(() => old.opts.events!.onError!({ data: 100 }));
    expect(screen.getByText("This video isn't available.")).toBeInTheDocument();
    rerender(<YouTubePlayer videoId="abcdefghijk" title="Onboard" />);
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(2));
    expect(old.calls).toContainEqual(["destroy"]);
    expect(last().opts.videoId).toBe("abcdefghijk");
    expect(screen.queryByText("This video isn't available.")).not.toBeInTheDocument();
  });

  it("creates exactly one player under StrictMode", async () => {
    render(
      <StrictMode>
        <YouTubePlayer videoId="dQw4w9WgXcQ" title="Onboard" />
      </StrictMode>,
    );
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(FakePlayer.instances).toHaveLength(1);
  });

  it("shows the unavailable message when the Player constructor throws", async () => {
    loadYouTubeApi.mockResolvedValue({
      Player: class {
        constructor() {
          throw new Error("boom");
        }
      },
    });
    render(<YouTubePlayer videoId="dQw4w9WgXcQ" title="Onboard" />);
    expect(await screen.findByText("This video isn't available.")).toBeInTheDocument();
  });
});
