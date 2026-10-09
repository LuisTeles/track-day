"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Button } from "@/shared/ui/button";
import type { VideoPlayerHandle } from "./player";
import { loadYouTubeApi, type YTPlayer } from "./youtube-api";
import { youtubeWatchUrl } from "./youtube-id";

type PlayerError = "unavailable" | "blocked" | "offline";

const MESSAGES: Record<PlayerError, string> = {
  unavailable: "This video isn't available.",
  blocked: "The owner doesn't allow this video in other apps.",
  offline: "The video needs an internet connection.",
};

const UNSTARTED = -1;
const PLAYING = 1;
const CUED = 5;
const ENDED = 0;

function errorFromCode(code: number): PlayerError {
  return code === 101 || code === 150 ? "blocked" : "unavailable";
}

export function YouTubePlayer({
  ref,
  videoId,
  title,
  onReady,
}: {
  ref?: Ref<VideoPlayerHandle>;
  videoId: string;
  title: string;
  onReady?(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The error is tied to the video and attempt it happened for, so a new videoId or a
  // retry never shows a stale message.
  const key = `${videoId}:${attempt}`;
  const [failure, setFailure] = useState<{ key: string; kind: PlayerError } | null>(null);
  const error = failure?.key === key ? failure.kind : null;
  const onReadyRef = useRef(onReady);
  const titleRef = useRef(title);
  useEffect(() => {
    onReadyRef.current = onReady;
    titleRef.current = title;
  });

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let cancelled = false;
    let created: YTPlayer | null = null;
    let ready: YTPlayer | null = null;
    const fail = (kind: PlayerError) => {
      if (!cancelled) setFailure({ key, kind });
    };
    // The API replaces the element it is given, so hand it a throwaway child.
    const target = document.createElement("div");
    container.appendChild(target);

    loadYouTubeApi().then(
      (YT) => {
        if (cancelled) return;
        try {
          created = new YT.Player(target, {
            videoId,
            host: "https://www.youtube-nocookie.com",
            playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
            events: {
              // The control methods (getCurrentTime, seekTo…) only exist from here on, so
              // the handle sees the player only once it is ready.
              onReady: (e) => {
                if (cancelled) return;
                ready = e.target;
                player.current = ready;
                const iframe = e.target.getIframe?.();
                if (iframe) iframe.title = titleRef.current;
                onReadyRef.current?.();
              },
              onError: (e) => fail(errorFromCode(e.data)),
            },
          });
        } catch {
          fail("unavailable");
        }
      },
      () => fail("offline"),
    );

    return () => {
      cancelled = true;
      if (ready && player.current === ready) player.current = null;
      created?.destroy();
      target.remove();
    };
  }, [videoId, attempt, key]);

  useEffect(() => {
    const iframe = player.current?.getIframe?.();
    if (iframe) iframe.title = title;
  }, [title]);

  useImperativeHandle(
    ref,
    () => ({
      currentTime: () => player.current?.getCurrentTime() ?? 0,
      // Seeking an unstarted, cued or ended video starts it (IFrame API): a jump never should.
      seek: (sec) => {
        const p = player.current;
        if (!p) return;
        const state = p.getPlayerState();
        p.seekTo(sec, true);
        if (state === UNSTARTED || state === CUED || state === ENDED) p.pauseVideo();
      },
      play: () => player.current?.playVideo(),
      pause: () => player.current?.pauseVideo(),
      isPlaying: () => player.current?.getPlayerState() === PLAYING,
    }),
    [],
  );

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <div ref={host} className={error ? "hidden" : "size-full [&_iframe]:size-full"} />
      {error && (
        <div
          role="alert"
          className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-white"
        >
          <p>{MESSAGES[error]}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {error === "offline" && (
              <Button
                variant="outline"
                onClick={() => {
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </Button>
            )}
            <Button asChild variant="outline">
              <a href={youtubeWatchUrl(videoId)} target="_blank" rel="noreferrer">
                Watch on YouTube
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
