"use client";

import { useState } from "react";
import type { CanvasContext } from "../track-view/track-canvas";

/** A move bigger than this share of the lap is a seek or a wrap, not driving. */
const JUMP = 0.25;

interface Seen {
  fraction: number | null;
  k: number;
  x: number;
  y: number;
  width: number;
  height: number;
  animate: boolean;
}

/**
 * The reference car on the map: a dot at `fraction` of the lap, in screen space. Hides
 * (renders nothing) when there is no position, never guessing one. It glides only on
 * ordinary forward moves: not on a seek or lap wrap, nor while the map is panned or zoomed.
 */
export function VideoDot({ ctx, fraction }: { ctx: CanvasContext; fraction: number | null }) {
  const { k, x, y } = ctx.zoom;
  const { width, height } = ctx.viewport;
  const [seen, setSeen] = useState<Seen>({
    fraction,
    k,
    x,
    y,
    width,
    height,
    animate: false,
  });
  let animate = seen.animate;
  if (
    !Object.is(seen.fraction, fraction) ||
    seen.k !== k ||
    seen.x !== x ||
    seen.y !== y ||
    seen.width !== width ||
    seen.height !== height
  ) {
    const sameView =
      seen.k === k &&
      seen.x === x &&
      seen.y === y &&
      seen.width === width &&
      seen.height === height;
    animate =
      sameView &&
      seen.fraction !== null &&
      fraction !== null &&
      Math.abs(fraction - seen.fraction) <= JUMP;
    setSeen({ fraction, k, x, y, width, height, animate });
  }

  if (fraction === null || !Number.isFinite(fraction)) return null;
  const p = ctx.toScreen(ctx.geometry.pointAt(fraction));
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        data-testid="video-dot"
        aria-hidden="true"
        style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
        className={`absolute top-0 left-0 -mt-2 -ml-2 size-4 rounded-full bg-accent shadow-md ring-3 ring-background ${
          animate
            ? "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-linear"
            : ""
        }`}
      />
    </div>
  );
}
