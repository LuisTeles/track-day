import type { Corner, Layout, ReferenceVideo, VideoMark } from "@track-day/schema";
import { cornerFraction } from "../track-view/geometry/anchors";

export interface Anchor {
  sec: number;
  fraction: number;
}

/** Start line (fraction 0) if marked, then each mark at its corner's lap fraction (`cornerFraction`), sorted by time. Marks for unknown corners or corners without a fraction are skipped. */
export function videoAnchors(
  video: ReferenceVideo,
  corners: Corner[],
  layout: Pick<Layout, "lengthMeters">,
): Anchor[] {
  const byId = new Map(corners.map((c) => [c.id, c]));
  const anchors: Anchor[] = [];
  for (const mark of video.marks) {
    const corner = byId.get(mark.cornerId);
    const fraction = corner ? cornerFraction(corner, layout) : null;
    if (fraction != null) anchors.push({ sec: mark.sec, fraction });
  }
  if (video.lapStartSec != null) anchors.push({ sec: video.lapStartSec, fraction: 0 });
  return anchors.sort((a, b) => a.sec - b.sec);
}

/** Lap fraction (0–1) at `sec`, linearly between neighbouring anchors; fractions are unwrapped so the lap only moves forward; `lapEndSec` closes the lap at the next pass of the start line. Null before the first anchor, after the last, or with fewer than 2 anchors. */
export function lapFractionAt(
  sec: number,
  anchors: Anchor[],
  lapEndSec: number | null,
): number | null {
  if (anchors.length < 2 || !Number.isFinite(sec)) return null;
  const pts: Anchor[] = [];
  for (const a of anchors) {
    const prev = pts[pts.length - 1];
    let fraction = a.fraction;
    if (prev) while (fraction < prev.fraction) fraction += 1;
    pts.push({ sec: a.sec, fraction });
  }
  const last = pts[pts.length - 1]!;
  if (lapEndSec != null && lapEndSec > last.sec) {
    // The lap closes at the next whole fraction: the start/finish line.
    const lastFraction = pts[pts.length - 1]!.fraction;
    const close = Math.ceil(lastFraction);
    pts.push({ sec: lapEndSec, fraction: close > lastFraction ? close : close + 1 });
  }
  const end = pts[pts.length - 1]!;
  if (sec < pts[0]!.sec || sec > end.sec) return null;
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1]!.sec <= sec) i++;
  const a = pts[i]!;
  const b = pts[i + 1];
  let value: number;
  if (!b || b.sec <= a.sec) value = a.fraction;
  else value = a.fraction + ((sec - a.sec) / (b.sec - a.sec)) * (b.fraction - a.fraction);
  return value - Math.floor(value);
}

/** The corner whose mark is the latest at or before `sec`; null before the first mark. */
export function cornerAt(sec: number, marks: VideoMark[]): string | null {
  let best: VideoMark | null = null;
  for (const m of marks) {
    if (m.sec <= sec && (!best || m.sec >= best.sec)) best = m;
  }
  return best?.cornerId ?? null;
}

const inLapOrder = (corners: Corner[]) => [...corners].sort((a, b) => a.order - b.order);

/** The next item to mark in lap order: "start", a corner id, "finish", or null when all are marked. */
export function nextToMark(
  video: ReferenceVideo,
  corners: Corner[],
): "start" | "finish" | string | null {
  if (video.lapStartSec == null) return "start";
  const marked = new Set(video.marks.map((m) => m.cornerId));
  const next = inLapOrder(corners).find((c) => !marked.has(c.id));
  if (next) return next.id;
  return video.lapEndSec == null ? "finish" : null;
}

/** Corners (by number) whose mark is earlier than the previous corner's in lap order; empty when valid. */
export function outOfOrder(video: ReferenceVideo, corners: Corner[]): number[] {
  const secs = new Map(video.marks.map((m) => [m.cornerId, m.sec]));
  const bad: number[] = [];
  let prev: number | null = null;
  for (const c of inLapOrder(corners)) {
    const sec = secs.get(c.id);
    if (sec == null) continue;
    if (prev != null && sec < prev) bad.push(c.number);
    prev = sec;
  }
  return bad;
}

/** 83.4 → "1:23.4"; 5 → "0:05.0". */
export function formatVideoTime(sec: number): string {
  const tenths = Math.round(Math.max(0, Number.isFinite(sec) ? sec : 0) * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** User-facing reasons the marks cannot be saved; empty when valid. */
export function markOrderProblems(video: ReferenceVideo, corners: Corner[]): string[] {
  const problems = outOfOrder(video, corners).map(
    (n) => `T${n} is marked before the corner ahead of it.`,
  );
  const secs = new Map(video.marks.map((m) => [m.cornerId, m.sec]));
  const marked = inLapOrder(corners).filter((c) => secs.has(c.id));
  const first = marked[0];
  const last = marked[marked.length - 1];
  if (first && video.lapStartSec != null && video.lapStartSec > secs.get(first.id)!) {
    problems.push(`The start line is marked after T${first.number}.`);
  }
  if (last && video.lapEndSec != null && video.lapEndSec < secs.get(last.id)!) {
    problems.push(`The finish line is marked before T${last.number}.`);
  }
  return problems;
}
