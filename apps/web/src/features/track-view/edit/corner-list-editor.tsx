"use client";

import type { Corner } from "@track-day/schema";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useAddCorner, useReorderCorners } from "./use-structure-mutations";

/** The corner list in edit mode: open a corner, move it in lap order, add one. */
export function CornerListEditor({
  layoutId,
  corners,
  onSelect,
}: {
  layoutId: string;
  corners: Corner[];
  onSelect(id: string): void;
}) {
  const add = useAddCorner();
  const reorder = useReorderCorners();
  const move = (index: number, delta: -1 | 1) => {
    const ids = corners.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate({ layoutId, cornerIds: ids });
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        Lap order, from the start line. Moving a corner keeps its number.
      </p>
      {corners.length === 0 ? (
        <p className="text-muted">This layout has no corners yet.</p>
      ) : (
        <ol className="-mx-2" aria-label="Corners in lap order">
          {corners.map((corner, i) => {
            const label = `T${corner.number}${corner.name ? ` ${corner.name}` : ""}`;
            return (
              <li key={corner.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(corner.id)}
                  className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left hover:bg-surface focus-ring"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-marker text-xs font-semibold text-marker-foreground tabular-nums">
                    {corner.number}
                  </span>
                  <span className="truncate">
                    {corner.name ?? <span className="text-muted">Unnamed</span>}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${label} earlier`}
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)}
                >
                  <ChevronUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${label} later`}
                  disabled={i === corners.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)}
                >
                  <ChevronDown aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {(reorder.error || add.error) && (
        <p role="alert" className="text-danger">
          {reorder.error
            ? `Could not reorder: ${reorder.error.message}`
            : `Could not add a corner: ${add.error!.message}`}
        </p>
      )}
      <Button
        variant="outline"
        disabled={add.isPending}
        onClick={() =>
          add.mutate({ layoutId, corners }, { onSuccess: (corner) => onSelect(corner.id) })
        }
      >
        <Plus aria-hidden />
        Add corner
      </Button>
    </div>
  );
}
