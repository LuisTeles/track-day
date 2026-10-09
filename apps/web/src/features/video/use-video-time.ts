"use client";

import { useEffect, useState, type RefObject } from "react";
import type { VideoPlayerHandle } from "./player";

/**
 * Current time of `handle`, refreshed every 250 ms while `active`; stops when inactive or
 * unmounted. Reads 0 while inactive and until the first poll after (re)activating, so a
 * previous video's time never leaks into the next.
 */
export function useVideoTime(handle: RefObject<VideoPlayerHandle | null>, active: boolean): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTime(handle.current?.currentTime() ?? 0), 250);
    return () => {
      clearInterval(id);
      setTime(0);
    };
  }, [handle, active]);
  return active ? time : 0;
}
