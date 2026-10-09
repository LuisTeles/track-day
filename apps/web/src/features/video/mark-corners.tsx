"use client";

import type { Corner, ReferenceVideo } from "@track-day/schema";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Button } from "@/shared/ui/button";
import { keyIsBlocked } from "../track-view/shortcuts";
import type { VideoPlayerHandle } from "./player";
import { formatVideoTime, markOrderProblems, nextToMark } from "./video-sync";

export interface MarkCornersProps {
  video: ReferenceVideo;
  corners: Corner[];
  playerRef: RefObject<VideoPlayerHandle | null>;
  onSave(video: ReferenceVideo): void;
  onCancel(): void;
  /** True while the draft differs from the saved marks. */
  onDirtyChange(dirty: boolean): void;
  /** A save is in flight: the buttons wait. */
  saving?: boolean;
}

const NUDGE = 0.5;
const round = (sec: number) => Math.round(sec * 10) / 10;

/** A markable point: the start line, a corner (by id) or the finish line. */
type Point = "start" | "finish" | (string & {});

const sameMarks = (a: ReferenceVideo, b: ReferenceVideo) =>
  a.lapStartSec === b.lapStartSec &&
  a.lapEndSec === b.lapEndSec &&
  a.marks.length === b.marks.length &&
  a.marks.every((m) => b.marks.find((o) => o.cornerId === m.cornerId)?.sec === m.sec);

/** Marking mode: stamp the video's current time on the start line, each corner and the finish line, on a draft that only a save keeps. */
export function MarkCorners({
  video,
  corners,
  playerRef,
  onSave,
  onCancel,
  onDirtyChange,
  saving = false,
}: MarkCornersProps) {
  const [draft, setDraft] = useState(video);
  /** Points in the order they were marked, for "Undo last mark". */
  const [history, setHistory] = useState<Point[]>([]);
  const inLapOrder = useMemo(() => [...corners].sort((a, b) => a.order - b.order), [corners]);

  const timeOf = (point: Point): number | null => {
    if (point === "start") return draft.lapStartSec;
    if (point === "finish") return draft.lapEndSec;
    return draft.marks.find((m) => m.cornerId === point)?.sec ?? null;
  };
  const withTime = (point: Point, sec: number | null): ReferenceVideo => {
    if (point === "start") return { ...draft, lapStartSec: sec };
    if (point === "finish") return { ...draft, lapEndSec: sec };
    const others = draft.marks.filter((m) => m.cornerId !== point);
    return { ...draft, marks: sec === null ? others : [...others, { cornerId: point, sec }] };
  };

  const dirty = !sameMarks(draft, video);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // Unmounting drops the draft, so it no longer counts as unsaved.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const next = nextToMark(draft, corners);
  const nextCorner = inLapOrder.find((c) => c.id === next);
  const cornerName = (c: Corner) => `T${c.number}${c.name ? ` ${c.name}` : ""}`;
  const nextLabel =
    next === "start"
      ? "Mark start line"
      : next === "finish"
        ? "Mark finish line"
        : nextCorner
          ? `Mark ${cornerName(nextCorner)}`
          : null;

  const mark = () => {
    const now = playerRef.current?.currentTime();
    if (next === null || now === undefined || !Number.isFinite(now)) return;
    setDraft(withTime(next, round(now)));
    setHistory((h) => [...h, next]);
  };
  const markEvent = useRef(mark);
  useEffect(() => {
    markEvent.current = mark;
  });

  // The M key marks, unless it is typing, a dialog or menu is open, or Ctrl/Cmd is held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "m" && e.key !== "M") || keyIsBlocked(e)) return;
      e.preventDefault();
      markEvent.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const nudge = (point: Point, delta: number) => {
    const sec = timeOf(point);
    if (sec !== null) setDraft(withTime(point, round(Math.max(0, sec + delta))));
  };
  const clear = (point: Point) => setDraft(withTime(point, null));
  const undoTarget = [...history].reverse().find((p) => timeOf(p) !== null) ?? null;
  const undo = () => {
    if (undoTarget === null) return;
    setDraft(withTime(undoTarget, null));
    setHistory((h) => h.slice(0, h.lastIndexOf(undoTarget)));
  };

  const problems = markOrderProblems(draft, corners);
  const blocked = problems.length > 0;

  // When the last point is marked the primary button goes away: keep focus in the panel.
  const saveButton = useRef<HTMLButtonElement>(null);
  const hadNext = useRef(next !== null);
  useEffect(() => {
    if (hadNext.current && next === null && document.activeElement === document.body) {
      saveButton.current?.focus();
    }
    hadNext.current = next !== null;
  }, [next]);

  const rows: { point: Point; name: string; aria: string }[] = [
    { point: "start", name: "Start line", aria: "start line" },
    ...inLapOrder.map((c) => ({ point: c.id, name: cornerName(c), aria: `T${c.number}` })),
    { point: "finish", name: "Finish line", aria: "finish line" },
  ];

  return (
    <div className="space-y-4">
      {nextLabel ? (
        <Button size="lg" className="w-full" onClick={mark}>
          {nextLabel}
        </Button>
      ) : (
        <p className="rounded-lg border border-border bg-surface p-3">Every point is marked.</p>
      )}
      <p className="text-xs text-muted">
        Play or scrub the video, then mark. Pressing M marks too.
      </p>
      <ul className="-mx-2" aria-label="Marks">
        {rows.map(({ point, name, aria }) => {
          const sec = timeOf(point);
          return (
            <li key={point} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1">
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              {sec === null ? (
                <span className="text-xs text-muted">Not marked</span>
              ) : (
                <>
                  <span className="tabular-nums">{formatVideoTime(sec)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Earlier ${aria}`}
                    onClick={() => nudge(point, -NUDGE)}
                  >
                    −0.5 s
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Later ${aria}`}
                    onClick={() => nudge(point, NUDGE)}
                  >
                    +0.5 s
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Clear ${aria}`}
                    onClick={() => clear(point)}
                  >
                    Clear
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {blocked && (
        <p role="alert" className="text-sm text-danger">
          {`${problems.join(" ")} Fix the order to save.`}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button
          ref={saveButton}
          disabled={blocked || saving}
          onClick={() => onSave({ ...draft, marks: sortMarks(draft, inLapOrder) })}
        >
          Save marks
        </Button>
        <Button variant="outline" disabled={undoTarget === null} onClick={undo}>
          Undo last mark
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function sortMarks(video: ReferenceVideo, inLapOrder: Corner[]) {
  const secs = new Map(video.marks.map((m) => [m.cornerId, m.sec]));
  return inLapOrder.flatMap((c) =>
    secs.has(c.id) ? [{ cornerId: c.id, sec: secs.get(c.id)! }] : [],
  );
}
