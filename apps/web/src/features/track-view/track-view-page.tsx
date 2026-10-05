"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";
import { CornerDetails, CornerList, cornerTitle } from "./corner-details";
import { SidePanel } from "./side-panel";
import { TrackCanvas, type TrackCanvasHandle } from "./track-canvas";
import { ToolButton, TrackViewShell } from "./track-view-shell";
import { useTrackView } from "./use-track-view";

/** `?track=<id>&layout=<id>&corner=<id>`; `panel=corners` opens the list. */
export function TrackViewPage() {
  const params = useSearchParams();
  const trackId = params.get("track");
  if (!trackId) return <Message>No track selected.</Message>;
  return <TrackView trackId={trackId} />;
}

function TrackView({ trackId }: { trackId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const canvas = useRef<TrackCanvasHandle>(null);
  const { data, isPending, error } = useTrackView(trackId, params.get("layout"));

  const cornerId = params.get("corner");
  const listOpen = params.get("panel") === "corners";

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const selectCorner = useCallback(
    (id: string) => setParams({ corner: id, panel: null }),
    [setParams],
  );
  const closePanel = useCallback(() => setParams({ corner: null, panel: null }), [setParams]);

  if (isPending) return <Message>Loading track…</Message>;
  if (error) return <Message>Could not load the track: {error.message}</Message>;
  if (!data) return <Message>This track doesn’t exist (it may have been deleted).</Message>;

  const { track, layouts, layout, corners, complexes } = data;
  const selected = corners.find((c) => c.id === cornerId) ?? null;

  const topBar = (
    <>
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Tracks
      </Link>
      <h1 className="text-sm font-semibold">
        {track.aliases[0] ?? track.name}
        {layout && layouts.length === 1 && (
          <span className="font-normal text-muted"> · {layout.name}</span>
        )}
      </h1>
      {layouts.length > 1 && (
        <select
          aria-label="Layout"
          value={layout?.id}
          onChange={(e) => setParams({ layout: e.target.value, corner: null })}
          className="rounded-md border border-border bg-transparent px-1.5 py-0.5 text-sm"
        >
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
    </>
  );

  if (!layout?.outlinePath) {
    return (
      <TrackViewShell
        topBar={topBar}
        canvas={<Message>This layout has no outline yet, so there’s no map to show.</Message>}
        controls={null}
        panel={null}
      />
    );
  }

  return (
    <TrackViewShell
      topBar={topBar}
      canvas={
        <TrackCanvas
          ref={canvas}
          outlinePath={layout.outlinePath}
          rotation={layout.rotation}
          label={`Map of ${track.name}, ${layout.name} layout`}
        />
      }
      controls={
        <>
          <ToolButton aria-label="Zoom in" onClick={() => canvas.current?.zoomBy(1.5)}>
            +
          </ToolButton>
          <ToolButton aria-label="Zoom out" onClick={() => canvas.current?.zoomBy(1 / 1.5)}>
            −
          </ToolButton>
          <ToolButton onClick={() => canvas.current?.reset()}>Reset view</ToolButton>
          <ToolButton
            pressed={listOpen}
            onClick={() => setParams({ panel: listOpen ? null : "corners", corner: null })}
          >
            Corners
          </ToolButton>
        </>
      }
      panel={
        <SidePanel
          open={selected !== null || listOpen}
          title={selected ? cornerTitle(selected) : "Corners"}
          onClose={closePanel}
        >
          {selected ? (
            <CornerDetails
              corner={selected}
              complexes={complexes}
              allCorners={corners}
              onSelect={selectCorner}
            />
          ) : (
            <CornerList corners={corners} onSelect={selectCorner} />
          )}
        </SidePanel>
      }
    />
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-canvas p-6 text-center text-muted">
      <div className="space-y-3">
        <p>{children}</p>
        <Link href="/" className="text-sm underline">
          Back to tracks
        </Link>
      </div>
    </div>
  );
}
