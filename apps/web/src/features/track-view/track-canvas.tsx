"use client";

import { useImperativeHandle, useMemo, useRef, type ReactNode, type Ref } from "react";
import { rotatePoint } from "./geometry/bounds";
import { fitToViewport } from "./geometry/fit";
import { nearestFraction } from "./geometry/nearest";
import { applyAffine, composeAffine, type Affine, type Point, type Size } from "./geometry/types";
import { useSize } from "./use-size";
import { useTrackGeometry, type TrackGeometry } from "./use-track-geometry";
import { useZoom } from "./use-zoom";

const PADDING = 48;
const TRACK_WIDTH_M = 13;

/** Screen space covered by floating UI (e.g. the side panel), in px from each edge. */
export interface Insets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface TrackCanvasHandle {
  reset(): void;
  zoomBy(factor: number): void;
  /** Pans so the point at `fraction` of the lap isn't hidden behind `insets`. */
  ensureVisible(fraction: number, insets: Insets): void;
}

/** Passed to overlays so they can position screen-space elements. */
export interface CanvasContext {
  geometry: TrackGeometry;
  /** Display-space point (see TrackGeometry) to screen pixels. */
  toScreen(p: Point): Point;
  zoom: Affine;
  viewport: Size;
}

interface TrackCanvasProps {
  outlinePath: string;
  rotation?: number | null;
  /** Real lap length; lets the asphalt be drawn at its true width when zoomed in. */
  lengthMeters?: number | null;
  /** Extra layers in the outline's own coordinate space (e.g. the racing line). */
  trackLayers?: (ctx: CanvasContext) => ReactNode;
  /** Screen-space overlays (markers, labels). */
  overlay?: (ctx: CanvasContext) => ReactNode;
  label: string;
  /** Pick mode: a click/tap (not a drag) reports the nearest lap position. */
  onPick?: (fraction: number) => void;
  ref?: Ref<TrackCanvasHandle>;
}

/**
 * Renders a layout outline fitted to its container, with pan/zoom. Rendering
 * only — no data loading — so it can be reused and tested in isolation.
 */
export function TrackCanvas({
  outlinePath,
  rotation,
  lengthMeters,
  trackLayers,
  overlay,
  label,
  onPick,
  ref,
}: TrackCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewport = useSize(containerRef);
  const geometry = useTrackGeometry(outlinePath, rotation ?? 0);
  const { transform: zoom, reset, zoomBy, panBy } = useZoom(containerRef, viewport);

  const fit = useMemo(
    () => fitToViewport(geometry.bounds, viewport, PADDING),
    [geometry.bounds, viewport],
  );
  const ctx = useMemo<CanvasContext>(() => {
    const screen = composeAffine(zoom, fit);
    return { geometry, toScreen: (p) => applyAffine(screen, p), zoom, viewport };
  }, [geometry, zoom, fit, viewport]);

  useImperativeHandle(
    ref,
    () => ({
      reset,
      zoomBy,
      ensureVisible(fraction, insets) {
        const p = ctx.toScreen(geometry.pointAt(fraction));
        const margin = 32;
        const area = {
          minX: (insets.left ?? 0) + margin,
          maxX: viewport.width - (insets.right ?? 0) - margin,
          minY: (insets.top ?? 0) + margin,
          maxY: viewport.height - (insets.bottom ?? 0) - margin,
        };
        if (p.x >= area.minX && p.x <= area.maxX && p.y >= area.minY && p.y <= area.maxY) return;
        panBy((area.minX + area.maxX) / 2 - p.x, (area.minY + area.maxY) / 2 - p.y);
      },
    }),
    [reset, zoomBy, panBy, ctx, geometry, viewport],
  );

  const ready = viewport.width > 0 && viewport.height > 0;
  // Strokes don't scale with the transform: keep a readable minimum, and once
  // zoomed in far enough, draw the asphalt at its real width (~13 m).
  const pxPerUnit = fit.k * zoom.k;
  const realWidth = lengthMeters
    ? TRACK_WIDTH_M * (geometry.path.length / lengthMeters) * pxPerUnit
    : 0;
  const width = Math.max(Math.min(14, 9 * Math.sqrt(zoom.k)), realWidth);
  const { pivot } = geometry;
  const start = ctx.toScreen(geometry.pointAt(0));
  const startTangent = geometry.tangentAt(0);

  const down = useRef<{ x: number; y: number } | null>(null);
  const pickProps = onPick
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          down.current = { x: e.clientX, y: e.clientY };
        },
        onClick: (e: React.MouseEvent<HTMLDivElement>) => {
          const start = down.current;
          down.current = null;
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const screen = composeAffine(zoom, fit);
          const display = {
            x: (e.clientX - rect.left - screen.x) / screen.k,
            y: (e.clientY - rect.top - screen.y) / screen.k,
          };
          const outline = rotatePoint(display, -geometry.rotation, geometry.pivot);
          onPick(nearestFraction(geometry.path, outline));
        },
      }
    : {};

  return (
    <div
      ref={containerRef}
      {...pickProps}
      className={`absolute inset-0 touch-none overflow-hidden select-none ${
        onPick ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <svg
        width={viewport.width}
        height={viewport.height}
        role="img"
        aria-label={label}
        className="block"
      >
        {ready && (
          <>
            <g transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`}>
              <g transform={`translate(${fit.x} ${fit.y}) scale(${fit.k})`}>
                <g transform={`rotate(${geometry.rotation} ${pivot.x} ${pivot.y})`}>
                  <path
                    d={outlinePath}
                    fill="none"
                    className="stroke-track-edge"
                    strokeWidth={width + 4}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={outlinePath}
                    fill="none"
                    className="stroke-track"
                    strokeWidth={width}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={outlinePath}
                    fill="none"
                    className="stroke-track-line"
                    strokeWidth={1}
                    strokeDasharray="6 8"
                    vectorEffect="non-scaling-stroke"
                  />
                  {trackLayers?.(ctx)}
                </g>
              </g>
            </g>
            <StartLine at={start} tangent={startTangent} length={width + 10} />
          </>
        )}
      </svg>
      {ready && (
        // While picking, nothing in the overlay may swallow the click, even markers
        // that opt back in with pointer-events-auto.
        <div
          className={
            onPick ? "pointer-events-none contents [&_*]:pointer-events-none!" : "contents"
          }
        >
          {overlay?.(ctx)}
        </div>
      )}
    </div>
  );
}

/** Checkered start/finish line across the track, in screen space. */
function StartLine({ at, tangent, length }: { at: Point; tangent: Point; length: number }) {
  const angle = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${angle})`} aria-hidden>
      <rect x={-3} y={-length / 2} width={6} height={length} fill="white" />
      {Array.from({ length: Math.ceil(length / 3) }, (_, i) => (
        <rect
          key={i}
          x={i % 2 ? -3 : 0}
          y={-length / 2 + i * 3}
          width={3}
          height={3}
          fill="black"
        />
      ))}
    </g>
  );
}
