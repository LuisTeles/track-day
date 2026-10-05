"use client";

import { useImperativeHandle, useMemo, useRef, type ReactNode, type Ref } from "react";
import { fitToViewport } from "./geometry/fit";
import { applyAffine, composeAffine, type Affine, type Point, type Size } from "./geometry/types";
import { useSize } from "./use-size";
import { useTrackGeometry, type TrackGeometry } from "./use-track-geometry";
import { useZoom } from "./use-zoom";

const PADDING = 48;

export interface TrackCanvasHandle {
  reset(): void;
  zoomBy(factor: number): void;
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
  /** Extra layers in the outline's own coordinate space (e.g. the racing line). */
  trackLayers?: (ctx: CanvasContext) => ReactNode;
  /** Screen-space overlays (markers, labels). */
  overlay?: (ctx: CanvasContext) => ReactNode;
  label: string;
  ref?: Ref<TrackCanvasHandle>;
}

/**
 * Renders a layout outline fitted to its container, with pan/zoom. Rendering
 * only — no data loading — so it can be reused and tested in isolation.
 */
export function TrackCanvas({
  outlinePath,
  rotation,
  trackLayers,
  overlay,
  label,
  ref,
}: TrackCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewport = useSize(containerRef);
  const geometry = useTrackGeometry(outlinePath, rotation ?? 0);
  const { transform: zoom, reset, zoomBy } = useZoom(svgRef, viewport);

  useImperativeHandle(ref, () => ({ reset, zoomBy }), [reset, zoomBy]);

  const fit = useMemo(
    () => fitToViewport(geometry.bounds, viewport, PADDING),
    [geometry.bounds, viewport],
  );
  const ctx = useMemo<CanvasContext>(() => {
    const screen = composeAffine(zoom, fit);
    return { geometry, toScreen: (p) => applyAffine(screen, p), zoom, viewport };
  }, [geometry, zoom, fit, viewport]);

  const ready = viewport.width > 0 && viewport.height > 0;
  // Strokes don't scale with the transform; widen them gently as you zoom in.
  const width = Math.min(28, 9 * Math.sqrt(zoom.k * Math.max(fit.k, 0.4)));
  const { pivot } = geometry;
  const start = ctx.toScreen(geometry.pointAt(0));
  const startTangent = geometry.tangentAt(0);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <svg
        ref={svgRef}
        width={viewport.width}
        height={viewport.height}
        role="img"
        aria-label={label}
        className="block cursor-grab touch-none select-none active:cursor-grabbing"
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
      {ready && overlay?.(ctx)}
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
