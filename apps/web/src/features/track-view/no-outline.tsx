import type { Corner } from "@track-day/schema";
import { CornerList } from "./corner-details";

/** Stands in for the map when a layout has no outline (e.g. right after an AI import). */
export function NoOutline({
  corners,
  onSelect,
}: {
  corners: Corner[];
  onSelect(id: string): void;
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pt-20 pb-24">
      <div className="mx-auto max-w-md space-y-3 rounded-xl border border-border bg-background p-4">
        <div>
          <h2 className="font-medium">Corners</h2>
          <p className="text-sm text-muted">
            This layout has no outline yet, so there’s no map. The map appears once an outline is
            added.
          </p>
        </div>
        <CornerList corners={corners} onSelect={onSelect} />
      </div>
    </div>
  );
}
