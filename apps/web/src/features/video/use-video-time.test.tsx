import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoPlayerHandle } from "./player";
import { useVideoTime } from "./use-video-time";

function makeHandle() {
  const currentTime = vi.fn(() => 1);
  const handle = { currentTime } as unknown as VideoPlayerHandle;
  return { ref: { current: handle }, currentTime };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useVideoTime", () => {
  it("polls every 250 ms while active", () => {
    const { ref, currentTime } = makeHandle();
    const { result } = renderHook(() => useVideoTime(ref, true));
    currentTime.mockReturnValue(3.5);
    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(3.5);
  });

  it("reads 0 once inactive, and again until the first poll after reactivating", () => {
    const { ref, currentTime } = makeHandle();
    const { result, rerender } = renderHook(({ on }) => useVideoTime(ref, on), {
      initialProps: { on: true },
    });
    currentTime.mockReturnValue(42);
    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(42);
    rerender({ on: false });
    expect(result.current).toBe(0);
    rerender({ on: true });
    expect(result.current).toBe(0);
  });

  it("keeps the last time when reading it throws (a player that isn't ready yet)", () => {
    const { ref, currentTime } = makeHandle();
    const { result } = renderHook(() => useVideoTime(ref, true));
    currentTime.mockImplementation(() => {
      throw new TypeError("getCurrentTime is not a function");
    });
    expect(() => act(() => void vi.advanceTimersByTime(1000))).not.toThrow();
    expect(result.current).toBe(0);
    currentTime.mockReturnValue(4);
    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(4);
  });

  it("stops polling when inactive and when unmounted", () => {
    const { ref, currentTime } = makeHandle();
    const { rerender, unmount } = renderHook(({ on }) => useVideoTime(ref, on), {
      initialProps: { on: true },
    });
    act(() => void vi.advanceTimersByTime(250));
    rerender({ on: false });
    currentTime.mockClear();
    act(() => void vi.advanceTimersByTime(1000));
    expect(currentTime).not.toHaveBeenCalled();
    rerender({ on: true });
    unmount();
    currentTime.mockClear();
    act(() => void vi.advanceTimersByTime(1000));
    expect(currentTime).not.toHaveBeenCalled();
  });
});
