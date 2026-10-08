"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { VideoPlayerHandle } from "./player";

export function FilePlayer({
  ref,
  file,
  title,
  onMetadata,
}: {
  ref?: Ref<VideoPlayerHandle>;
  file: File;
  title: string;
  onMetadata?(meta: { durationSec: number }): void;
}) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const url = URL.createObjectURL(file);
    el.src = url;
    return () => {
      el.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useImperativeHandle(
    ref,
    () => ({
      currentTime: () => video.current?.currentTime ?? 0,
      seek: (sec) => {
        if (video.current) video.current.currentTime = sec;
      },
      play: () => void video.current?.play()?.catch(() => {}),
      pause: () => video.current?.pause(),
      isPlaying: () => !!video.current && !video.current.paused && !video.current.ended,
    }),
    [],
  );

  return (
    <video
      ref={video}
      title={title}
      controls
      playsInline
      className="aspect-video w-full rounded-xl bg-black"
      onLoadedMetadata={(e) => {
        const durationSec = e.currentTarget.duration;
        if (Number.isFinite(durationSec) && durationSec > 0) onMetadata?.({ durationSec });
      }}
    />
  );
}
