import { createRef } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilePlayer } from "./file-player";
import type { VideoPlayerHandle } from "./player";

const create = vi.fn();
const revoke = vi.fn();
const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

beforeEach(() => {
  let n = 0;
  create.mockImplementation(() => `blob:fake-${++n}`);
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  HTMLMediaElement.prototype.play = play;
  HTMLMediaElement.prototype.pause = pause;
});
afterEach(() => vi.clearAllMocks());

const file = (name = "a.mp4") => new File(["x"], name, { type: "video/mp4" });

describe("FilePlayer", () => {
  it("renders a native video with controls and one object URL", () => {
    const { container, unmount } = render(<FilePlayer file={file()} title="Lap" />);
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("controls");
    expect(video.getAttribute("src")).toBe("blob:fake-1");
    expect(video).toHaveAttribute("title", "Lap");
    expect(create).toHaveBeenCalledTimes(1);
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:fake-1");
  });

  it("revokes the previous URL when the file changes", () => {
    const { rerender } = render(<FilePlayer file={file("a.mp4")} title="t" />);
    rerender(<FilePlayer file={file("b.mp4")} title="t" />);
    expect(revoke).toHaveBeenCalledWith("blob:fake-1");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("reports duration on loadedmetadata", () => {
    const onMetadata = vi.fn();
    const { container } = render(<FilePlayer file={file()} title="t" onMetadata={onMetadata} />);
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 42.5, configurable: true });
    fireEvent(video, new Event("loadedmetadata"));
    expect(onMetadata).toHaveBeenCalledWith({ durationSec: 42.5 });
  });

  it("exposes a handle that seeks, plays and pauses", () => {
    const ref = createRef<VideoPlayerHandle>();
    const { container } = render(<FilePlayer ref={ref} file={file()} title="t" />);
    const video = container.querySelector("video")!;
    act(() => ref.current!.seek(12));
    expect(video.currentTime).toBe(12);
    expect(ref.current!.currentTime()).toBe(12);
    expect(ref.current!.isPlaying()).toBe(false);
    act(() => ref.current!.play());
    expect(play).toHaveBeenCalled();
    act(() => ref.current!.pause());
    expect(pause).toHaveBeenCalled();
  });
});
