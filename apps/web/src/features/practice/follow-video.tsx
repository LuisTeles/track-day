"use client";

import type { ReferenceVideo, VideoMark } from "@track-day/schema";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { FilePlayer } from "@/features/video/file-player";
import type { VideoPlayerHandle } from "@/features/video/player";
import { useVideoTime } from "@/features/video/use-video-time";
import { FilePicker } from "@/features/video/video-panel";
import { cornerAt } from "@/features/video/video-sync";
import { YouTubePlayer } from "@/features/video/youtube-player";
import { Button } from "@/shared/ui/button";
import type { PracticeStep } from "./navigation/steps";

/**
 * After a manual move, how long the video's corner may still be an older one (a seek can
 * take a moment to show in the player's time) before the video leads the card again.
 */
const SEEK_GRACE_MS = 1500;

interface FollowVideoProps {
  video: ReferenceVideo;
  title: string;
  steps: PracticeStep[];
  /** The step on the card. */
  current: number;
  /** The video reached a corner of another step. */
  onStep(index: number): void;
}

/**
 * The reference video in the practice card's diagram slot, kept in step with the card both
 * ways: the video passing a corner's mark moves the card; moving the card by hand seeks the
 * video to that step's first marked corner (never starting playback). Marks are read-only.
 */
export function FollowVideo({ video, title, steps, current, onStep }: FollowVideoProps) {
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  /** The corner the card and the video last agreed on. */
  const synced = useRef<string | null>(null);
  /** A manual move: until `until`, only `cornerId` from the video is believed. */
  const guard = useRef<{ cornerId: string | null; until: number } | null>(null);
  const marks = useMemo(() => new Map(video.marks.map((m) => [m.cornerId, m.sec])), [video.marks]);
  const markedCorner = (step: PracticeStep) => step.corners.find((c) => marks.has(c.id)) ?? null;

  // The card moved (by hand, or to a step the video isn't in): seek the video there.
  const syncVideo = useEffectEvent(() => {
    const step = steps[current];
    if (!step) return;
    if (synced.current && step.corners.some((c) => c.id === synced.current)) return;
    const target = markedCorner(step);
    synced.current = (target ?? step.corners[0]!).id;
    const player = playerRef.current;
    if (!readyRef.current || !player) return; // the player seeks once ready
    guard.current = { cornerId: target?.id ?? null, until: Date.now() + SEEK_GRACE_MS };
    if (target) player.seek(marks.get(target.id)!);
  });
  useEffect(() => syncVideo(), [current, steps]);

  const onReady = () => {
    readyRef.current = true;
    setReady(true);
    const step = steps[current];
    if (!step) return;
    const target = markedCorner(step);
    synced.current = (target ?? step.corners[0]!).id;
    if (target) playerRef.current?.seek(marks.get(target.id)!);
  };
  const resetPlayer = () => {
    readyRef.current = false;
    setReady(false);
  };

  // The video moved into another corner.
  const onCorner = (cornerId: string | null) => {
    const g = guard.current;
    if (g && Date.now() < g.until && cornerId !== g.cornerId) return;
    guard.current = null;
    if (cornerId === null) return;
    const index = steps.findIndex((s) => s.corners.some((c) => c.id === cornerId));
    if (index < 0) return;
    synced.current = cornerId;
    if (index !== current) onStep(index);
  };

  const clock = (
    <CornerClock playerRef={playerRef} active={ready} marks={video.marks} onChange={onCorner} />
  );

  if (video.source === "youtube") {
    return (
      <Slot>
        <YouTubePlayer
          key={video.youtubeId}
          ref={playerRef}
          videoId={video.youtubeId}
          title={title}
          onReady={onReady}
        />
        {clock}
      </Slot>
    );
  }
  return (
    <FileFollow
      video={video}
      title={title}
      playerRef={playerRef}
      onReady={onReady}
      onReset={resetPlayer}
      clock={clock}
    />
  );
}

/**
 * Fills the diagram slot without ever growing it: the player keeps 16:9 and shrinks to the
 * slot's height. Taps and keys on it belong to the player, not to corner navigation.
 */
function Slot({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  return (
    <div data-no-nav data-media className="relative size-full min-h-0">
      <div
        className={
          scroll
            ? "absolute inset-0 space-y-3 overflow-y-auto text-sm"
            : "absolute inset-0 flex items-center justify-center *:max-h-full"
        }
      >
        {children}
      </div>
    </div>
  );
}

function FileFollow({
  video,
  title,
  playerRef,
  onReady,
  onReset,
  clock,
}: {
  video: Extract<ReferenceVideo, { source: "file" }>;
  title: string;
  playerRef: RefObject<VideoPlayerHandle | null>;
  onReady(): void;
  onReset(): void;
  clock: ReactNode;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mismatch, setMismatch] = useState<File | null>(null);
  const [unplayable, setUnplayable] = useState(false);

  const play = (f: File) => {
    onReset();
    setMismatch(null);
    setUnplayable(false);
    setFile(f);
  };

  if (file) {
    return (
      <Slot>
        <FilePlayer
          ref={playerRef}
          file={file}
          title={title}
          onMetadata={onReady}
          onError={() => {
            onReset();
            setFile(null);
            setUnplayable(true);
          }}
        />
        {clock}
      </Slot>
    );
  }

  return (
    <Slot scroll>
      <p className="break-words">{`Choose ${video.file.name} to follow it.`}</p>
      <FilePicker
        onPick={(f) => {
          setUnplayable(false);
          if (f.name === video.file.name && f.size === video.file.sizeBytes) return play(f);
          setMismatch(f);
        }}
      />
      {unplayable && (
        <p role="alert" className="text-danger">
          {"This file can't be played in this browser."}
        </p>
      )}
      {mismatch && (
        <div role="status" className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <p className="break-words">
            {`That's a different file (${mismatch.name}). Its timing may not match the saved marks.`}
          </p>
          <Button variant="secondary" onClick={() => play(mismatch)}>
            Use with these marks
          </Button>
        </div>
      )}
    </Slot>
  );
}

/**
 * Owns the ~4 Hz video clock so only this renders per tick; reports the corner whose mark
 * the video is at, only when it changes.
 */
function CornerClock({
  playerRef,
  active,
  marks,
  onChange,
}: {
  playerRef: RefObject<VideoPlayerHandle | null>;
  active: boolean;
  marks: VideoMark[];
  onChange(cornerId: string | null): void;
}) {
  const time = useVideoTime(playerRef, active);
  const cornerId = active ? cornerAt(time, marks) : null;
  const report = useEffectEvent((id: string | null) => onChange(id));
  useEffect(() => report(cornerId), [cornerId]);
  return null;
}
