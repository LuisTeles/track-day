"use client";

import type { CornerGuide } from "@track-day/schema";
import { Button } from "@/shared/ui/button";
import { checkLineOrder, lapDelta, type LinePoint } from "../geometry/nearest";
import { useSaveCornerGuide } from "./use-edit-mutations";

const FAR_METERS = 300;
const NAMES: Record<LinePoint, string> = { turnIn: "turn-in", apex: "apex", exit: "exit" };
const AT = { turnIn: "turnInAt", apex: "apexAt", exit: "exitAt" } as const;

const positions = (guide: CornerGuide | undefined) => ({
  turnIn: guide?.line.turnInAt ?? null,
  apex: guide?.line.apexAt ?? null,
  exit: guide?.line.exitAt ?? null,
});

const lineWith = (guide: CornerGuide | undefined, point: LinePoint, value: number | null) => ({
  ...(guide?.line ?? {
    turnIn: null,
    apex: null,
    exit: null,
    turnInAt: null,
    apexAt: null,
    exitAt: null,
  }),
  [AT[point]]: value,
});

interface PickOptions {
  guideId: string;
  cornerId: string;
  guide: CornerGuide | undefined;
  /** The corner's own position, to warn about far-away points. */
  cornerFraction: number | null;
  lengthMeters: number | null;
  point: LinePoint;
  onDone(): void;
  onError?(message: string): void;
}

/** Click handler for the map while a line point is being placed. */
export function useLinePointPick({
  guideId,
  cornerId,
  guide,
  cornerFraction,
  lengthMeters,
  point,
  onDone,
  onError,
}: PickOptions) {
  const save = useSaveCornerGuide();
  return async (fraction: number) => {
    if (!checkLineOrder({ ...positions(guide), [point]: fraction })) {
      onError?.(
        point === "turnIn"
          ? "Turn-in must come before the apex and exit."
          : point === "apex"
            ? "The apex must come between turn-in and exit."
            : "The exit must come after turn-in and the apex.",
      );
      return;
    }
    if (cornerFraction !== null && lengthMeters) {
      const meters = Math.round(Math.abs(lapDelta(cornerFraction, fraction)) * lengthMeters);
      if (
        meters > FAR_METERS &&
        !window.confirm(
          `This is ${meters} m from the corner — place the ${NAMES[point]} here anyway?`,
        )
      ) {
        return;
      }
    }
    await save.mutateAsync({
      guideId,
      cornerId,
      existing: guide,
      patch: { line: lineWith(guide, point, fraction) },
    });
    onDone();
  };
}

export function LinePoints({
  guideId,
  cornerId,
  guide,
  hasOutline,
  picking,
  onPickStart,
  onPickEnd,
}: {
  guideId: string;
  cornerId: string;
  guide: CornerGuide | undefined;
  cornerFraction: number | null;
  lengthMeters: number | null;
  hasOutline: boolean;
  picking: LinePoint | null;
  onPickStart(point: LinePoint): void;
  onPickEnd(): void;
}) {
  const save = useSaveCornerGuide();
  const set = positions(guide);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Line</legend>
      <div className="flex flex-wrap gap-2">
        {(["turnIn", "apex", "exit"] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1">
            <Button
              variant="outline"
              aria-pressed={picking === p}
              disabled={!hasOutline}
              onClick={() => (picking === p ? onPickEnd() : onPickStart(p))}
            >
              Set {NAMES[p]}
              {set[p] !== null && <span aria-hidden> ✓</span>}
            </Button>
            {set[p] !== null && (
              <Button
                variant="outline"
                aria-label={`Clear ${NAMES[p]}`}
                onClick={() =>
                  save.mutate({
                    guideId,
                    cornerId,
                    existing: guide,
                    patch: { line: lineWith(guide, p, null) },
                  })
                }
              >
                ×
              </Button>
            )}
          </span>
        ))}
      </div>
      {picking && (
        <p className="text-sm text-muted" aria-live="polite">
          Click or tap the track to place the {NAMES[picking]}.
        </p>
      )}
      {!hasOutline && (
        <p className="text-sm text-muted">
          Add a map from OpenStreetMap to place the line on the track.
        </p>
      )}
    </fieldset>
  );
}
