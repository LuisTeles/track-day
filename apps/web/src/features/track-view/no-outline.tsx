"use client";

import type { Corner, Layout, Track } from "@track-day/schema";
import { useState, useSyncExternalStore } from "react";
import { AddMapPanel } from "@/features/osm-map/add-map-panel";
import { Button } from "@/shared/ui/button";
import { CornerList } from "./corner-details";

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Stands in for the map when a layout has no outline (e.g. right after an AI import). */
export function NoOutline({
  track,
  layout,
  corners,
  onSelect,
}: {
  track: Track;
  layout: Layout;
  corners: Corner[];
  onSelect(id: string): void;
}) {
  const [adding, setAdding] = useState(false);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pt-20 pb-24">
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-border bg-background p-4">
        {adding ? (
          <>
            <h2 className="font-medium">Add map from OpenStreetMap</h2>
            <AddMapPanel
              track={track}
              layout={layout}
              corners={corners}
              onClose={() => setAdding(false)}
            />
          </>
        ) : (
          <>
            <div className="space-y-2">
              <h2 className="font-medium">Corners</h2>
              <p className="text-sm text-muted">
                This layout has no outline yet, so there’s no map. Add one from OpenStreetMap, or
                the map appears once an outline is added another way.
              </p>
              <Button onClick={() => setAdding(true)} disabled={!online}>
                Add map from OpenStreetMap
              </Button>
              {!online && (
                <p className="text-xs text-muted">Adding a map needs an internet connection.</p>
              )}
            </div>
            <CornerList corners={corners} onSelect={onSelect} />
          </>
        )}
      </div>
    </div>
  );
}
