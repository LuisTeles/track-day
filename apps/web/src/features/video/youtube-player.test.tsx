import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoPlayerHandle } from "./player";
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
  constructor(
    public el: HTMLElement,
    public opts: YTPlayerOptions,
  ) {
    FakePlayer.instances.push(this);
  }
  seekTo(s: number, a: boolean) {
    this.calls.push(["seekTo", s, a]);
    this.time = s;
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

async function mount(extra: { onReady?: () => void } = {}) {
  const ref = createRef<VideoPlayerHandle>();
  const utils = render(
    <YouTubePlayer ref={ref} videoId="dQw4w9WgXcQ" title="Onboard" {...extra} />,
  );
  await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
  return { ref, ...utils };
}

describe("YouTubePlayer", () => {
  it("creates the player with the nocookie host, title and ready callback", async () => {
    const onReady = vi.fn();
    await mount({ onReady });
    expect(last().opts.videoId).toBe("dQw4w9WgXcQ");
    expect(last().opts.host).toBe("https://www.youtube-nocookie.com");
    expect(last().opts.playerVars).toMatchObject({ rel: 0, modestbranding: 1, playsinline: 1 });
    expect(last().iframe.title).toBe("Onboard");
    act(() => last().opts.events!.onReady!({ target: last() }));
    expect(onReady).toHaveBeenCalled();
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
});
