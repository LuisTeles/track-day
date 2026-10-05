"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { CornerDetails, CornerList, cornerTitle } from "./corner-details";
import { CornerMarkers } from "./corner-markers";
import { getRacingLine, RacingLineLayer } from "./racing-line";
import { cornerFraction } from "./geometry/anchors";
import { SidePanel } from "./side-panel";
import { TrackCanvas, type TrackCanvasHandle } from "./track-canvas";
import { ToolButton, TrackViewShell } from "./track-view-shell";
import { useStoredToggle } from "@/shared/hooks/use-stored-toggle";
import { CornerGuideSection } from "./corner-guide-section";
import { chipsFor, guideLabel } from "./guides";
import { useCornerGuides, useTrackView } from "./use-track-view";

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
  const [showChips, toggleChips] = useStoredToggle("track-view:chips", true);
  const [showRacingLine, toggleRacingLine] = useStoredToggle("track-view:racing-line", true);

  // Until the global car picker exists (M4), the layout's guides are picked here.
  const guide = data?.guides.find((g) => g.id === params.get("guide")) ?? data?.guides[0] ?? null;
  const { data: cornerGuides } = useCornerGuides(guide?.id ?? null);
  const chips = useMemo(() => (cornerGuides ? chipsFor(cornerGuides) : null), [cornerGuides]);

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

  // Keep the selected corner out from under the side panel / bottom sheet.
  const selectedCorner = data?.corners.find((c) => c.id === cornerId);
  const selectedFraction =
    selectedCorner && data?.layout ? cornerFraction(selectedCorner, data.layout) : null;
  useEffect(() => {
    if (selectedFraction === null) return;
    const frame = requestAnimationFrame(() => {
      const panel = document.querySelector("[data-testid=side-panel]")?.getBoundingClientRect();
      if (!panel) return;
      const sheet = panel.width >= window.innerWidth - 1; // bottom sheet spans the full width
      canvas.current?.ensureVisible(
        selectedFraction,
        sheet
          ? { top: 64, bottom: window.innerHeight - panel.top }
          : { top: 64, right: window.innerWidth - panel.left },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedFraction]);

  if (isPending) return <Message>Loading track…</Message>;
  if (error) return <Message>Could not load the track: {error.message}</Message>;
  if (!data) return <Message>This track doesn’t exist (it may have been deleted).</Message>;

  const { track, layouts, layout, corners, complexes, guides } = data;
  const racingLine = layout ? getRacingLine(layout) : null;
  const currentGuideLabel = guide
    ? guideLabel(guide, data.carClasses ?? [], data.cars ?? [])
    : null;
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
          lengthMeters={layout.lengthMeters}
          trackLayers={() => racingLine && showRacingLine && <RacingLineLayer line={racingLine} />}
          label={`Map of ${track.name}, ${layout.name} layout`}
          overlay={(ctx) => (
            <CornerMarkers
              ctx={ctx}
              layout={layout}
              corners={corners}
              selectedId={selected?.id ?? null}
              onSelect={selectCorner}
              chips={showChips ? chips : null}
            />
          )}
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
          <ToolButton pressed={showChips} disabled={!guide} onClick={toggleChips}>
            Speed &amp; gear
          </ToolButton>
          <ToolButton
            pressed={showRacingLine && racingLine !== null}
            disabled={!racingLine}
            onClick={toggleRacingLine}
          >
            Racing line
          </ToolButton>
          {guides.length > 0 && (
            <select
              aria-label="Guide"
              value={guide?.id}
              onChange={(e) => setParams({ guide: e.target.value })}
              className="max-w-44 rounded-lg border border-border bg-transparent px-1.5 py-1 text-sm"
            >
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {guideLabel(g, data.carClasses ?? [], data.cars ?? [])}
                </option>
              ))}
            </select>
          )}
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
              guide={
                guide &&
                currentGuideLabel && (
                  <CornerGuideSection
                    guide={cornerGuides?.find((g) => g.cornerId === selected.id)}
                    label={currentGuideLabel}
                  />
                )
              }
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
