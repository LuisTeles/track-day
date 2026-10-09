import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Corner, Guide, ReferenceVideo } from "@track-day/schema";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { ConfirmProvider } from "@/shared/ui/confirm";
import type { VideoPlayerHandle } from "./player";
import type { YTPlayerOptions } from "./youtube-api";

const loadYouTubeApi = vi.fn();
vi.mock("./youtube-api", () => ({ loadYouTubeApi: (...a: unknown[]) => loadYouTubeApi(...a) }));

import { VideoPanel } from "./video-panel";

class FakePlayer {
  static instances: FakePlayer[] = [];
  time = 0;
  state = -1;
  destroyed = false;
  constructor(
    public el: HTMLElement,
    public opts: YTPlayerOptions,
  ) {
    FakePlayer.instances.push(this);
    queueMicrotask(() => opts.events?.onReady?.({ target: this }));
  }
  seekTo(s: number) {
    this.time = s;
  }
  playVideo() {
    this.state = 1;
  }
  pauseVideo() {
    this.state = 2;
  }
  getCurrentTime() {
    return this.time;
  }
  getPlayerState() {
    return this.state;
  }
  destroy() {
    this.destroyed = true;
  }
}
const player = () => FakePlayer.instances[FakePlayer.instances.length - 1]!;

const corner = (id: string, number: number, name: string | null): Corner =>
  ({ id, number, name, order: number }) as Corner;
// Out of lap order on purpose: the panel sorts by `order`.
const corners = [corner("c2", 2, null), corner("c1", 1, "Senna"), corner("c3", 3, "Curva do Sol")];

const youtube = (marks = [{ cornerId: "c1", sec: 12.5 }]): ReferenceVideo => ({
  source: "youtube",
  youtubeId: "dQw4w9WgXcQ",
  lapStartSec: 10,
  lapEndSec: null,
  marks,
});
const fileVideo = (marks = [{ cornerId: "c1", sec: 12.5 }]): ReferenceVideo => ({
  source: "file",
  file: { name: "lap.mp4", sizeBytes: 4, durationSec: 95 },
  lapStartSec: marks.length ? 10 : null,
  lapEndSec: null,
  marks,
});

beforeEach(() => {
  FakePlayer.instances = [];
  loadYouTubeApi.mockResolvedValue({ Player: FakePlayer });
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:fake-${++n}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.clearAllMocks());

function setup(
  video: ReferenceVideo | null,
  extra: Partial<React.ComponentProps<typeof VideoPanel>> = {},
) {
  const update = vi.fn().mockResolvedValue({});
  const playerRef = createRef<VideoPlayerHandle>();
  const props = {
    guide: { id: "g1", video } as Guide,
    label: "GT3 · any sim",
    corners,
    layout: { lengthMeters: 4309 },
    trackId: "t1",
    playerRef,
    ...extra,
  };
  const wrap = (p: typeof props) => (
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{ guides: { update } } as unknown as Repositories}>
        <ConfirmProvider>
          <VideoPanel {...p} />
        </ConfirmProvider>
      </RepositoriesProvider>
    </QueryClientProvider>
  );
  const view = render(wrap(props));
  return {
    update,
    playerRef,
    user: userEvent.setup(),
    rerender: (more: Partial<typeof props>) => view.rerender(wrap({ ...props, ...more })),
    unmount: view.unmount,
  };
}

const mp4 = (name = "lap.mp4", body = "abcd") => new File([body], name, { type: "video/mp4" });

/** jsdom never loads media: set a duration and fire the event the player listens for. */
function loadMetadata(durationSec: number) {
  const video = document.querySelector("video")!;
  Object.defineProperty(video, "duration", { configurable: true, value: durationSec });
  fireEvent.loadedMetadata(video);
}

describe("VideoPanel without a video", () => {
  it("offers a YouTube link or a file", () => {
    setup(null);
    expect(screen.getByLabelText("Paste a YouTube link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this video" })).toBeInTheDocument();
    const picker = screen.getByLabelText("Choose a video file");
    expect(picker).toHaveAttribute("type", "file");
    expect(picker).toHaveAttribute("accept", "video/*");
  });

  it("rejects something that isn't a YouTube link", async () => {
    const { update, user } = setup(null);
    await user.type(screen.getByLabelText("Paste a YouTube link"), "https://vimeo.com/123");
    await user.click(screen.getByRole("button", { name: "Use this video" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That doesn't look like a YouTube link. Paste one like https://youtu.be/…",
    );
    expect(screen.getByLabelText("Paste a YouTube link")).toHaveAccessibleDescription(
      "That doesn't look like a YouTube link. Paste one like https://youtu.be/…",
    );
    expect(screen.getByLabelText("Paste a YouTube link")).toHaveAttribute("aria-invalid", "true");
    expect(update).not.toHaveBeenCalled();
  });

  it("saves only the video id of a valid link, with no marks", async () => {
    const { update, user } = setup(null);
    await user.type(
      screen.getByLabelText("Paste a YouTube link"),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    );
    await user.click(screen.getByRole("button", { name: "Use this video" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("g1", {
        video: {
          source: "youtube",
          youtubeId: "dQw4w9WgXcQ",
          lapStartSec: null,
          lapEndSec: null,
          marks: [],
        },
      }),
    );
  });

  it("says when a new file can't be played, saving nothing", async () => {
    const { update, user } = setup(null);
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("clip.mkv"));
    fireEvent.error(document.querySelector("video")!);
    expect(await screen.findByText("This file can't be played in this browser.")).toBeVisible();
    expect(screen.getByLabelText("Choose a video file")).toBeInTheDocument();
    expect(screen.getByLabelText("Paste a YouTube link")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("moves focus to the corner list once a video is attached", async () => {
    const { user, rerender } = setup(null);
    await user.type(screen.getByLabelText("Paste a YouTube link"), "dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Use this video" }));
    rerender({ guide: { id: "g1", video: youtube([]) } as Guide });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Corners on the video" })).toHaveFocus(),
    );
  });

  it("moves focus to the corner list once a file is picked", async () => {
    const { user } = setup(null);
    await user.upload(screen.getByLabelText("Choose a video file"), mp4());
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Corners on the video" })).toHaveFocus(),
    );
  });

  it("does not take focus when it opens on a video", async () => {
    setup(youtube());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    expect(screen.getByRole("heading", { name: "Corners on the video" })).not.toHaveFocus();
  });

  it("plays a picked file and saves its name, size and duration", async () => {
    const { update, user } = setup(null);
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("onboard.mp4", "123456"));
    expect(document.querySelector("video")).toHaveAttribute("src", "blob:fake-1");
    expect(update).not.toHaveBeenCalled(); // waits for the duration
    loadMetadata(83.4);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("g1", {
        video: {
          source: "file",
          file: { name: "onboard.mp4", sizeBytes: 6, durationSec: 83.4 },
          lapStartSec: null,
          lapEndSec: null,
          marks: [],
        },
      }),
    );
  });
});

describe("VideoPanel with a file video", () => {
  it("asks for the file again in a new session", () => {
    setup(fileVideo());
    expect(
      screen.getByText(
        "This car's video is a file on your device: lap.mp4, 1:35. Choose it to play.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Choose a video file")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("plays the same file with the saved marks without saving", async () => {
    const { update, user } = setup(fileVideo());
    await user.upload(screen.getByLabelText("Choose a video file"), mp4());
    expect(document.querySelector("video")).toBeInTheDocument();
    loadMetadata(95);
    expect(screen.getByRole("button", { name: "T1 Senna · 0:12.5" })).toBeEnabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("never reuses marks silently for a different file", async () => {
    const { update, user } = setup(fileVideo());
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("other.mp4"));
    expect(
      screen.getByText(
        "That's a different file (other.mp4). Its timing may not match the saved marks.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("button", { name: "Use with these marks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start new marks" })).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("says when the same file can't be played, and keeps the picker", async () => {
    const { update, user } = setup(fileVideo());
    await user.upload(screen.getByLabelText("Choose a video file"), mp4());
    fireEvent.error(document.querySelector("video")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This file can't be played in this browser.",
    );
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByLabelText("Choose a video file")).toBeInTheDocument();
    expect(screen.getByText(/This car's video is a file on your device/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("says when a different file used with the marks can't be played, saving nothing", async () => {
    const { update, user } = setup(fileVideo());
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("other.mkv", "xy"));
    await user.click(screen.getByRole("button", { name: "Use with these marks" }));
    fireEvent.error(document.querySelector("video")!);
    expect(await screen.findByText("This file can't be played in this browser.")).toBeVisible();
    expect(screen.getByLabelText("Choose a video file")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    // Picking a playable file clears the message.
    await user.upload(screen.getByLabelText("Choose a video file"), mp4());
    expect(screen.queryByText("This file can't be played in this browser.")).toBeNull();
  });

  it("treats a same-named file of another size as different", async () => {
    const { user } = setup(fileVideo());
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("lap.mp4", "123456789"));
    expect(screen.getByText(/That's a different file \(lap\.mp4\)/)).toBeInTheDocument();
  });

  it("uses a different file with the saved marks, recording the new file", async () => {
    const { update, user } = setup(fileVideo());
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("other.mp4", "xy"));
    await user.click(screen.getByRole("button", { name: "Use with these marks" }));
    expect(document.querySelector("video")).toBeInTheDocument();
    loadMetadata(96);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("g1", {
        video: {
          source: "file",
          file: { name: "other.mp4", sizeBytes: 2, durationSec: 96 },
          lapStartSec: 10,
          lapEndSec: null,
          marks: [{ cornerId: "c1", sec: 12.5 }],
        },
      }),
    );
  });

  it("confirms before starting new marks, and keeps them on cancel", async () => {
    const { update, user } = setup(fileVideo());
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("other.mp4", "xy"));
    await user.click(screen.getByRole("button", { name: "Start new marks" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Start new marks?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.querySelector("video")).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("starts new marks with the new file after confirming", async () => {
    const { update, user } = setup(fileVideo());
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("other.mp4", "xy"));
    await user.click(screen.getByRole("button", { name: "Start new marks" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Start new marks?" });
    await user.click(within(dialog).getByRole("button", { name: "Start new marks" }));
    await waitFor(() => expect(document.querySelector("video")).toBeInTheDocument());
    loadMetadata(60);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("g1", {
        video: {
          source: "file",
          file: { name: "other.mp4", sizeBytes: 2, durationSec: 60 },
          lapStartSec: null,
          lapEndSec: null,
          marks: [],
        },
      }),
    );
  });

  it("starts new marks without asking when nothing is marked", async () => {
    const { user } = setup(fileVideo([]));
    await user.upload(screen.getByLabelText("Choose a video file"), mp4("other.mp4", "xy"));
    await user.click(screen.getByRole("button", { name: "Start new marks" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.querySelector("video")).toBeInTheDocument();
  });
});

describe("VideoPanel watching", () => {
  it("lists corners in lap order and seeks to a marked one", async () => {
    const { user } = setup(youtube());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    const list = screen.getByRole("list", { name: "Corners on the video" });
    const rows = within(list).getAllByRole("button");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      "T1 Senna · 0:12.5",
      "T2 · Not marked",
      "T3 Curva do Sol · Not marked",
    ]);
    expect(rows[1]).toBeDisabled();
    await user.click(rows[0]!);
    expect(player().time).toBe(12.5);
  });

  it("seeks once the player is ready when asked before", async () => {
    let ready: (() => void) | undefined;
    loadYouTubeApi.mockResolvedValue({
      Player: class extends FakePlayer {
        constructor(el: HTMLElement, opts: YTPlayerOptions) {
          super(el, { ...opts, events: { ...opts.events, onReady: undefined } });
          ready = () => opts.events?.onReady?.({ target: this });
        }
      },
    });
    const { rerender } = setup(youtube());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    rerender({ seekRequest: { sec: 30, id: 1 } });
    expect(player().time).toBe(0);
    act(() => ready!());
    expect(player().time).toBe(30);
  });

  it("seeks on a seek request from the map", async () => {
    const { rerender } = setup(youtube());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    await act(() => Promise.resolve()); // onReady
    rerender({ seekRequest: { sec: 12.5, id: 1 } });
    expect(player().time).toBe(12.5);
    player().time = 50;
    rerender({ seekRequest: { sec: 12.5, id: 2 } });
    expect(player().time).toBe(12.5);
  });

  it("ignores a seek request made before it opened", async () => {
    setup(youtube(), { seekRequest: { sec: 40, id: 3 } });
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    await act(() => Promise.resolve());
    expect(player().time).toBe(0);
  });

  it("links to the video on YouTube", async () => {
    setup(youtube());
    const link = screen.getByRole("link", { name: /Watch on YouTube/ });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("titles the player after the car", async () => {
    setup(null);
    await userEvent.upload(screen.getByLabelText("Choose a video file"), mp4());
    expect(document.querySelector("video")).toHaveAttribute(
      "title",
      "Reference video for GT3 · any sim",
    );
  });

  it("removes the video after confirming", async () => {
    const { update, user } = setup(youtube());
    await user.click(screen.getByRole("button", { name: "Remove video" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove this video?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove video" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("g1", { video: null }));
  });

  it("keeps the player usable when removing fails", async () => {
    const { update, user } = setup(youtube());
    update.mockRejectedValueOnce(new Error("disk full"));
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    await act(() => Promise.resolve()); // onReady
    await user.click(screen.getByRole("button", { name: "Remove video" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove this video?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove video" }));
    expect(await screen.findByText("Could not save: disk full")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "T1 Senna · 0:12.5" }));
    expect(player().time).toBe(12.5);
  });

  it("reports playing and stops the player when unmounted", async () => {
    const onPlayingChange = vi.fn();
    const { unmount } = setup(youtube(), { onPlayingChange });
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    await act(() => Promise.resolve());
    player().state = 1;
    await waitFor(() => expect(onPlayingChange).toHaveBeenLastCalledWith(true));
    unmount();
    expect(player().destroyed).toBe(true);
    expect(onPlayingChange).toHaveBeenLastCalledWith(false);
  });

  it("revokes the file's object URL when unmounted", async () => {
    const { unmount } = setup(null);
    await userEvent.upload(screen.getByLabelText("Choose a video file"), mp4());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-1");
  });
});

describe("VideoPanel marking", () => {
  const ready = async () => {
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    await act(() => Promise.resolve()); // onReady
  };

  it("marks from the player's time, saves, and returns to the corner list", async () => {
    const onDirtyChange = vi.fn();
    const { update, user } = setup({ ...youtube([]), lapStartSec: null }, { onDirtyChange });
    await ready();
    await user.click(screen.getByRole("button", { name: "Mark corners" }));
    expect(screen.queryByRole("heading", { name: "Corners on the video" })).toBeNull();
    player().time = 7.25;
    await user.click(screen.getByRole("button", { name: "Mark start line" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Save marks" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("g1", {
        video: expect.objectContaining({ lapStartSec: 7.3, marks: [] }),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Corners on the video" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mark corners" })).toHaveFocus();
    expect(player().destroyed).toBe(false);
  });

  it("cancel discards the draft and keeps the player", async () => {
    const { update, user } = setup(youtube());
    await ready();
    await user.click(screen.getByRole("button", { name: "Mark corners" }));
    await user.click(screen.getByRole("button", { name: "Clear T1" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "T1 Senna · 0:12.5" })).toBeEnabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("waits for the player before marking", () => {
    setup(youtube());
    expect(screen.getByRole("button", { name: "Mark corners" })).toBeDisabled();
  });
});
