"use client";

import type { CanvasContext } from "../track-view/track-canvas";

/**
 * The reference car on the map: a dot at `fraction` of the lap, in screen space. Hides
 * (renders nothing) when there is no position, never guessing one.
 */
export function VideoDot({ ctx, fraction }: { ctx: CanvasContext; fraction: number | null }) {
  if (fraction === null || !Number.isFinite(fraction)) return null;
  const p = ctx.toScreen(ctx.geometry.pointAt(fraction));
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        data-testid="video-dot"
        aria-hidden="true"
        style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
        className="absolute top-0 left-0 -mt-2 -ml-2 size-4 rounded-full bg-accent shadow-md ring-3 ring-background motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-linear"
      />
    </div>
  );
}
