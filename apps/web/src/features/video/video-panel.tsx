"use client";

import type { Corner, Guide, Layout, ReferenceVideo, VideoFile } from "@track-day/schema";
import { ExternalLink, Trash2 } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { FilePlayer } from "./file-player";
import type { VideoPlayerHandle } from "./player";
import { useSaveVideo } from "./use-save-video";
import { formatVideoTime } from "./video-sync";
import { parseYouTubeId, youtubeWatchUrl } from "./youtube-id";
import { YouTubePlayer } from "./youtube-player";

/** A seek asked for from outside the panel (a map marker); `id` makes repeats distinct. */
export interface SeekRequest {
  sec: number;
  id: number;
}

export interface VideoPanelProps {
  guide: Guide;
  /** The car's label, e.g. "GT3 · any sim". */
  label: string;
  corners: Corner[];
  /** For the map dot and marking (later tasks); unused by the panel itself. */
  layout: Pick<Layout, "lengthMeters">;
  trackId: string;
  /** Filled with the mounted player's handle; null while no player is ready. */
  playerRef: RefObject<VideoPlayerHandle | null>;
  /** Called when playback starts or stops, and with false when the player goes away. */
  onPlayingChange?(playing: boolean): void;
  seekRequest?: SeekRequest | null;
}

/**
 * How a picked file relates to the saved video. "same": name and size match, play with
 * the saved marks. "keep": a different file the user chose to use with the saved marks.
 * "fresh": a new video, saved with no marks.
 */
type Plan = "same" | "keep" | "fresh";

const NO_MARKS = { lapStartSec: null, lapEndSec: null, marks: [] };

/** 95 → "1:35". */
function formatDuration(sec: number) {
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function hasMarks(video: ReferenceVideo) {
  return video.marks.length > 0 || video.lapStartSec !== null || video.lapEndSec !== null;
}

/** Attach a car's reference video, pick its file each session, watch it and jump to corners. */
export function VideoPanel({
  guide,
  label,
  corners,
  trackId,
  playerRef,
  onPlayingChange,
  seekRequest,
}: VideoPanelProps) {
  const video = guide.video;
  const save = useSaveVideo(trackId);
  const confirm = useConfirm();
  const [picked, setPicked] = useState<{ file: File; plan: Plan } | null>(null);
  const [mismatch, setMismatch] = useState<File | null>(null);
  /** The last picked file the browser couldn't play; nothing was saved for it. */
  const [unplayable, setUnplayable] = useState(false);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  const savedFile = useRef<File | null>(null);

  const saveVideo = (next: ReferenceVideo | null) =>
    save.mutate({ guideId: guide.id, video: next });

  /** Seeks now when the player is ready, otherwise as soon as it is. */
  const seek = (sec: number) => {
    if (readyRef.current && playerRef.current) playerRef.current.seek(sec);
    else pendingSeek.current = sec;
  };
  const onPlayerReady = () => {
    readyRef.current = true;
    setReady(true);
    const sec = pendingSeek.current;
    pendingSeek.current = null;
    if (sec !== null) playerRef.current?.seek(sec);
  };
  const resetPlayer = () => {
    readyRef.current = false;
    setReady(false);
  };

  // After attaching (the form or picker that had focus is gone), focus the corner list.
  // Opening the panel on a video leaves focus with the panel's own heading.
  const hasPlayer = video?.source === "youtube" || picked !== null;
  const listHeading = useRef<HTMLHeadingElement>(null);
  const listId = useId();
  const hadPlayer = useRef(hasPlayer);
  useEffect(() => {
    if (hasPlayer && !hadPlayer.current) listHeading.current?.focus();
    hadPlayer.current = hasPlayer;
  }, [hasPlayer]);

  // A request made before this panel mounted (say, before it was last closed) is stale.
  const staleRequest = useRef(seekRequest?.id);
  const onSeekRequest = useEffectEvent((sec: number) => seek(sec));
  useEffect(() => {
    if (seekRequest && seekRequest.id !== staleRequest.current) onSeekRequest(seekRequest.sec);
  }, [seekRequest]);

  const reportPlaying = useEffectEvent((playing: boolean) => onPlayingChange?.(playing));
  useEffect(() => {
    if (!ready) return;
    let playing = false;
    const id = setInterval(() => {
      const now = playerRef.current?.isPlaying() ?? false;
      if (now !== playing) {
        playing = now;
        reportPlaying(now);
      }
    }, 250);
    return () => {
      clearInterval(id);
      if (playing) reportPlaying(false);
    };
  }, [ready, playerRef]);

  const play = (file: File, plan: Plan) => {
    setMismatch(null);
    setUnplayable(false);
    resetPlayer();
    setPicked({ file, plan });
  };

  const onPick = (file: File) => {
    setUnplayable(false);
    if (video?.source === "file") {
      const same = file.name === video.file.name && file.size === video.file.sizeBytes;
      if (same) return play(file, "same");
      setPicked(null);
      return setMismatch(file);
    }
    play(file, "fresh");
  };

  const onMetadata = ({ durationSec }: { durationSec: number }) => {
    onPlayerReady();
    if (!picked || picked.plan === "same" || savedFile.current === picked.file) return;
    savedFile.current = picked.file;
    const file: VideoFile = { name: picked.file.name, sizeBytes: picked.file.size, durationSec };
    if (picked.plan === "keep" && video) {
      const { lapStartSec, lapEndSec, marks } = video;
      saveVideo({ source: "file", file, lapStartSec, lapEndSec, marks });
    } else {
      saveVideo({ source: "file", file, ...NO_MARKS });
    }
  };

  // Back to the picker: no metadata came, so nothing was saved for this file.
  const onFileError = () => {
    resetPlayer();
    setPicked(null);
    setUnplayable(true);
  };

  const startNewMarks = async (file: File) => {
    if (video && hasMarks(video)) {
      const ok = await confirm({
        title: "Start new marks?",
        description: "The corner times marked on the saved video will be removed.",
        confirmLabel: "Start new marks",
        destructive: true,
      });
      if (!ok) return;
    }
    play(file, "fresh");
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Remove this video?",
      description: "Its corner marks are removed too. The video itself isn't touched.",
      confirmLabel: "Remove video",
      destructive: true,
    });
    if (!ok) return;
    // Only once it's gone: if the save fails, the player stays and keeps working.
    save.mutate(
      { guideId: guide.id, video: null },
      {
        onSuccess: () => {
          resetPlayer();
          setPicked(null);
          setMismatch(null);
        },
      },
    );
  };

  const title = `Reference video for ${label}`;
  const error = save.error && (
    <p role="alert" className="text-sm text-danger">
      Could not save: {save.error.message}
    </p>
  );
  const unplayableMessage = unplayable && (
    <p role="alert" className="text-sm text-danger">
      {"This file can't be played in this browser."}
    </p>
  );

  let player: ReactNode = null;
  if (video?.source === "youtube") {
    player = (
      <YouTubePlayer
        key={video.youtubeId}
        ref={playerRef}
        videoId={video.youtubeId}
        title={title}
        onReady={onPlayerReady}
      />
    );
  } else if (picked) {
    player = (
      <FilePlayer
        ref={playerRef}
        file={picked.file}
        title={title}
        onMetadata={onMetadata}
        onError={onFileError}
      />
    );
  }

  if (!player) {
    return (
      <div className="space-y-5 text-sm">
        {video?.source === "file" ? (
          <section className="space-y-3">
            <p className="break-words">
              {`This car's video is a file on your device: ${video.file.name}, ${formatDuration(video.file.durationSec)}. Choose it to play.`}
            </p>
            <FilePicker onPick={onPick} />
            {unplayableMessage}
            {mismatch && (
              <div
                role="status"
                className="space-y-3 rounded-lg border border-border bg-surface p-3"
              >
                <p className="break-words">
                  {`That's a different file (${mismatch.name}). Its timing may not match the saved marks.`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => play(mismatch, "keep")}>
                    Use with these marks
                  </Button>
                  <Button variant="outline" onClick={() => void startNewMarks(mismatch)}>
                    Start new marks
                  </Button>
                </div>
              </div>
            )}
            <RemoveButton onClick={() => void remove()} disabled={save.isPending} />
          </section>
        ) : (
          <AttachForm
            disabled={save.isPending}
            onYouTube={(youtubeId) => saveVideo({ source: "youtube", youtubeId, ...NO_MARKS })}
            onPick={onPick}
          />
        )}
        {video?.source !== "file" && unplayableMessage}
        {error}
      </div>
    );
  }

  const marks = new Map(video?.marks.map((m) => [m.cornerId, m.sec]));
  const inLapOrder = [...corners].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-4 text-sm">
      {player}
      {error}
      <h3 ref={listHeading} id={listId} tabIndex={-1} className="font-semibold outline-none">
        Corners on the video
      </h3>
      <ol aria-labelledby={listId} className="-mx-2">
        {inLapOrder.map((corner) => {
          const sec = marks.get(corner.id);
          const name = `T${corner.number}${corner.name ? ` ${corner.name}` : ""}`;
          const time = sec === undefined ? "Not marked" : formatVideoTime(sec);
          return (
            <li key={corner.id}>
              <button
                type="button"
                aria-label={`${name} · ${time}`}
                disabled={sec === undefined}
                onClick={() => sec !== undefined && seek(sec)}
                className="focus-ring flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left enabled:hover:bg-surface disabled:cursor-not-allowed"
              >
                <span className="flex-1 truncate font-medium">{name}</span>
                <span className={sec === undefined ? "text-xs text-muted" : "tabular-nums"}>
                  {time}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {video?.source === "youtube" && (
          <Button asChild variant="outline">
            <a href={youtubeWatchUrl(video.youtubeId)} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              Watch on YouTube
            </a>
          </Button>
        )}
        {video && <RemoveButton onClick={() => void remove()} disabled={save.isPending} />}
      </div>
    </div>
  );
}

function RemoveButton({ onClick, disabled }: { onClick(): void; disabled: boolean }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled}>
      <Trash2 aria-hidden />
      Remove video
    </Button>
  );
}

function FilePicker({ onPick }: { onPick(file: File): void }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Choose a video file</Label>
      <input
        id={id}
        type="file"
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so picking the same file again still fires a change.
          e.target.value = "";
          if (file) onPick(file);
        }}
        className="focus-ring block w-full min-w-0 rounded-lg text-sm text-muted file:mr-3 file:h-10 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:text-sm file:font-medium file:text-foreground pointer-coarse:file:h-11"
      />
      <p className="text-xs text-muted">The file stays on your device. Only its name is saved.</p>
    </div>
  );
}

function AttachForm({
  disabled,
  onYouTube,
  onPick,
}: {
  disabled: boolean;
  onYouTube(youtubeId: string): void;
  onPick(file: File): void;
}) {
  const id = useId();
  const [link, setLink] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const youtubeId = parseYouTubeId(link);
          setInvalid(youtubeId === null);
          if (youtubeId) onYouTube(youtubeId);
        }}
      >
        <Label htmlFor={`${id}-link`}>Paste a YouTube link</Label>
        <Input
          id={`${id}-link`}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setInvalid(false);
          }}
          placeholder="https://youtu.be/…"
          inputMode="url"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
        />
        {invalid && (
          <p id={`${id}-error`} role="alert" className="text-sm text-danger">
            {"That doesn't look like a YouTube link. Paste one like https://youtu.be/…"}
          </p>
        )}
        <Button type="submit" disabled={disabled}>
          Use this video
        </Button>
      </form>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">or</p>
      <FilePicker onPick={onPick} />
    </>
  );
}
