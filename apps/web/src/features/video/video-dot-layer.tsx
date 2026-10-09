"use client";

import type { Corner, Layout, ReferenceVideo } from "@track-day/schema";
import { useEffect, useMemo, type RefObject } from "react";
import type { CanvasContext } from "../track-view/track-canvas";
import type { VideoPlayerHandle } from "./player";
import { useVideoTime } from "./use-video-time";
import { VideoDot } from "./video-dot";
import { cornerAt, lapFractionAt, markOrderProblems, videoAnchors } from "./video-sync";

interface VideoDotLayerProps {
  ctx: CanvasContext;
  playerRef: RefObject<VideoPlayerHandle | null>;
  /** The video panel is open: the player is polled and the dot shown. */
  active: boolean;
  video: ReferenceVideo | null;
  corners: Corner[];
  layout: Pick<Layout, "lengthMeters">;
  /** The corner whose mark the video is at; called only when it changes. */
  onCornerChange(cornerId: string | null): void;
}

/**
 * Owns the video clock so its ~4 Hz updates re-render only the dot, not the page or the
 * markers. The dot hides unless the marks are in order and give at least two anchors.
 */
export function VideoDotLayer({
  ctx,
  playerRef,
  active,
  video,
  corners,
  layout,
  onCornerChange,
}: VideoDotLayerProps) {
  const time = useVideoTime(playerRef, active);
  const anchors = useMemo(
    () =>
      video && markOrderProblems(video, corners).length === 0
        ? videoAnchors(video, corners, layout)
        : [],
    [video, corners, layout],
  );
  const cornerId = active && video ? cornerAt(time, video.marks) : null;
  useEffect(() => onCornerChange(cornerId), [cornerId, onCornerChange]);
  useEffect(() => () => onCornerChange(null), [onCornerChange]);
  const fraction = active && video ? lapFractionAt(time, anchors, video.lapEndSec) : null;
  return <VideoDot ctx={ctx} fraction={fraction} />;
}
