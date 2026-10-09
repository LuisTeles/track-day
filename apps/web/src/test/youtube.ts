import type { YTPlayer, YTPlayerOptions } from "@/features/video/youtube-api";

const CONTROLS = [
  "seekTo",
  "playVideo",
  "pauseVideo",
  "getCurrentTime",
  "getPlayerState",
  "getIframe",
] as const;

/**
 * Like the real IFrame API, a fake player has no control methods until it is ready:
 * this hides them on `player` (calling one throws a TypeError) and returns `ready()`,
 * which puts them back and fires `onReady`. Calling `ready()` again does nothing.
 */
export function controlsAfterReady(player: object, opts: YTPlayerOptions): () => void {
  for (const name of CONTROLS) {
    Object.defineProperty(player, name, { value: undefined, configurable: true, writable: true });
  }
  let isReady = false;
  return () => {
    if (isReady) return;
    isReady = true;
    for (const name of CONTROLS) delete (player as Record<string, unknown>)[name];
    opts.events?.onReady?.({ target: player as YTPlayer });
  };
}
