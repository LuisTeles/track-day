"use client";

import type { Corner, Layout } from "@track-day/schema";
import { useMemo } from "react";
import { cornerFraction } from "./geometry/anchors";
import { outwardNormal, placeLabels, type LabelInput } from "./geometry/labels";
import type { Point, Size } from "./geometry/types";
import type { CanvasContext } from "./track-canvas";

/** Compact speed/gear info shown next to a badge. */
export interface CornerChip {
  text: string;
  /** Spoken version for the marker's accessible name. */
  description: string;
  /** Shown as a text "est." suffix so estimates never rely on color alone. */
  estimate: boolean;
}

interface CornerMarkersProps {
  ctx: CanvasContext;
  layout: Pick<Layout, "lengthMeters">;
  corners: Corner[];
  selectedId: string | null;
  onSelect(cornerId: string): void;
  chips?: ReadonlyMap<string, CornerChip> | null;
  /** Show corner names next to the badges from this zoom level up. */
  namesFromZoom?: number;
}

const BADGE = 28;
const NAME_CHAR = 6.6;
const CHIP_CHAR = 6.6;

/** Label size from its content, without measuring the DOM (keeps placement pure and stable). */
export function estimateLabelSize(name: string | null, chip: string | null): Size {
  let width = BADGE;
  if (name) width += 8 + name.length * NAME_CHAR;
  if (chip) width += 8 + chip.length * CHIP_CHAR + 10;
  return { width: Math.ceil(width), height: BADGE };
}

/**
 * Numbered corner badges in screen space: constant size at any zoom,
 * collision-avoiding, with leader lines back to the track when displaced.
 */
export function CornerMarkers({
  ctx,
  layout,
  corners,
  selectedId,
  onSelect,
  chips,
  namesFromZoom = 1.75,
}: CornerMarkersProps) {
  const { geometry, toScreen, zoom } = ctx;

  // Track-space anchors don't depend on zoom; compute them once per layout.
  const anchors = useMemo(
    () =>
      corners.flatMap((corner) => {
        const f = cornerFraction(corner, layout);
        if (f === null) return [];
        const point = geometry.pointAt(f);
        const outward = outwardNormal(point, geometry.tangentAt(f), geometry.centroid);
        return [{ corner, point, outward }];
      }),
    [corners, layout, geometry],
  );

  const showNames = zoom.k >= namesFromZoom;
  const labels = anchors.map(({ corner, point, outward }) => {
    const name = showNames || corner.id === selectedId ? corner.name : null;
    const chip = chips?.get(corner.id) ?? null;
    const chipText = chip ? chip.text + (chip.estimate ? " est." : "") : null;
    return {
      corner,
      name,
      chip,
      chipText,
      input: {
        id: corner.id,
        anchor: toScreen(point),
        outward,
        size: estimateLabelSize(name, chipText),
        offset: corner.labelOffset,
      } satisfies LabelInput,
    };
  });

  // The selected label is placed first so it never gets pushed away.
  const order = [...labels].sort(
    (a, b) => Number(b.corner.id === selectedId) - Number(a.corner.id === selectedId),
  );
  const edge = 6;
  const placed = new Map(
    placeLabels(
      order.map((l) => l.input),
      {
        bounds: {
          minX: edge,
          minY: edge,
          maxX: ctx.viewport.width - edge,
          maxY: ctx.viewport.height - edge,
        },
      },
    ).map((p) => [p.id, p]),
  );

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="corner-markers">
      <svg className="absolute inset-0 size-full overflow-visible" aria-hidden>
        {labels.map(({ corner, input }) => {
          const p = placed.get(corner.id)!;
          if (!p.leader) return null;
          return (
            <g key={corner.id} className="text-marker">
              <line
                x1={input.anchor.x}
                y1={input.anchor.y}
                x2={p.badge.x}
                y2={p.badge.y}
                stroke="currentColor"
                strokeWidth={1.25}
                opacity={0.7}
              />
              <circle cx={input.anchor.x} cy={input.anchor.y} r={3.5} fill="currentColor" />
            </g>
          );
        })}
      </svg>

      {labels.map(({ corner, name, chip, chipText, input }) => {
        const p = placed.get(corner.id)!;
        const selected = corner.id === selectedId;
        const left: Point = {
          x: p.center.x - input.size.width / 2,
          y: p.center.y - input.size.height / 2,
        };
        return (
          <button
            key={corner.id}
            type="button"
            data-corner={corner.number}
            aria-pressed={selected}
            aria-label={[
              `Turn ${corner.number}`,
              corner.name,
              chip && `${chip.description}${chip.estimate ? ", estimate" : ""}`,
            ]
              .filter(Boolean)
              .join(", ")}
            onClick={() => onSelect(corner.id)}
            style={{ transform: `translate(${left.x}px, ${left.y}px)`, height: input.size.height }}
            className="group pointer-events-auto absolute before:absolute before:top-1/2 before:left-[14px] before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:content-[''] top-0 left-0 flex items-center gap-1 rounded-full whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums shadow-md ring-2 motion-safe:transition-transform motion-safe:group-hover:scale-110 ${
                selected
                  ? "bg-accent motion-safe:scale-110 text-accent-foreground ring-background"
                  : "bg-marker text-marker-foreground ring-background/80"
              }`}
            >
              {corner.number}
            </span>
            {name && (
              <span className="rounded-md bg-background/90 px-1.5 py-0.5 text-xs font-medium text-foreground shadow-sm">
                {name}
              </span>
            )}
            {chipText && (
              <span className="rounded-md border border-border bg-chip px-1.5 py-0.5 text-xs font-medium text-foreground tabular-nums shadow-sm">
                {chipText}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
