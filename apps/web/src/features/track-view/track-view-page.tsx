"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDetails, CornerList, cornerTitle } from "./corner-details";
import { CarSetup } from "./car-setup";
import { CornerMarkers } from "./corner-markers";
import { DeleteTrackButton } from "./delete-track-button";
import { AddMapPanel } from "@/features/osm-map/add-map-panel";
import { NoOutline } from "./no-outline";
import { AddCarDialog } from "./edit/add-car-dialog";
import { CornerGuideForm } from "./edit/corner-guide-form";
import { CornerNotesForm } from "./edit/corner-notes-form";
import { CarLinesLayer, carLines } from "./edit/car-lines";
import { LinePoints, useLinePointPick } from "./edit/line-points";
import type { LinePoint } from "./geometry/nearest";
import { getRacingLine, RacingLineLayer } from "./racing-line";
import { cornerFraction } from "./geometry/anchors";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";
import { Select } from "@/shared/ui/select";
import { MapToolbar } from "./map-toolbar";
import { SidePanel } from "./side-panel";
import { shortcutFor, type ShortcutAction } from "./shortcuts";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { TrackCanvas, type TrackCanvasHandle } from "./track-canvas";
import { TrackViewShell } from "./track-view-shell";
import { useStoredToggle } from "@/shared/hooks/use-stored-toggle";
import { useToast } from "@/shared/ui/toast";
import type { VideoPlayerHandle } from "@/features/video/player";
import { VideoPanel, type SeekRequest } from "@/features/video/video-panel";
import { VideoDotLayer } from "@/features/video/video-dot-layer";
import { OsmAttribution } from "@/shared/ui/osm-attribution";
import { CornerGuideSection } from "./corner-guide-section";
import { chipsFor, guideLabel } from "./guides";
import { terrainOf } from "./terrain";
import { useCornerGuides, useTrackView } from "./use-track-view";

const DISCARD = {
  title: "Discard unsaved changes?",
  confirmLabel: "Discard changes",
  cancelLabel: "Keep editing",
  destructive: true,
} as const;

/**
 * `?track=<id>&layout=<id>&corner=<id>`; `panel=corners` opens the list,
 * `panel=setup` the car's setup and `panel=video` its reference video.
 */
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
  const [showTerrain, toggleTerrain] = useStoredToggle("track-view:terrain", false);
  const [showRacingLine, toggleRacingLine] = useStoredToggle("track-view:racing-line", true);
  const [redoingMap, setRedoingMap] = useState(false);
  const editing = params.get("edit") === "1";
  const [picking, setPicking] = useState<LinePoint | null>(null);
  const [addingCar, setAddingCar] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  const onCornerDirty = useCallback(
    (value: boolean) => setDirty((d) => (d.corner === value ? d : { ...d, corner: value })),
    [setDirty],
  );
  const onGuideDirty = useCallback(
    (value: boolean) => setDirty((d) => (d.guide === value ? d : { ...d, guide: value })),
    [setDirty],
  );
  const onSetupDirty = useCallback(
    (value: boolean) => setDirty((d) => (d.setup === value ? d : { ...d, setup: value })),
    [setDirty],
  );
  const onVideoDirty = useCallback(
    (value: boolean) => setDirty((d) => (d.video === value ? d : { ...d, video: value })),
    [setDirty],
  );
  const confirm = useConfirm();
  const toast = useToast();
  // The reference video's player, shared with the map (marker seeks, the lap dot).
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const isDirty = () => Object.values(dirtyRef.current).some(Boolean);
  /**
   * Bumped whenever unsaved edits are discarded. Drafts whose component stays mounted
   * (the video panel's marking) reset on it, so a discarded draft never lingers untracked.
   */
  const [discards, setDiscards] = useState(0);
  const clearEdits = () => {
    if (isDirty()) setDiscards((n) => n + 1);
    setDirty({});
    setPicking(null);
    setPickError(null);
  };
  /**
   * Runs `then` once dropping unsaved edits is fine: right away when there are
   * none (so a clean click acts in the same event, as before), otherwise only
   * after the user picks "Discard changes".
   */
  const confirmDiscard = (then: () => void) => {
    if (!isDirty()) return then();
    const description = dirtyRef.current.setup
      ? "Your setup notes haven’t been saved."
      : dirtyRef.current.video
        ? "Your video marks haven’t been saved."
        : "Your edits to this corner haven’t been saved.";
    void confirm({ ...DISCARD, description }).then((ok) => ok && then());
  };
  /** Asks before dropping unsaved edits; on yes, clears the edit state first. */
  const leaveEdits = (then: () => void) =>
    confirmDiscard(() => {
      clearEdits();
      then();
    });
  /**
   * For links: a clean click navigates as usual. A dirty one is held back while
   * the dialog asks, then navigates on "Discard changes". Modified clicks open
   * a new tab or window, which leaves this page and its edits alone.
   */
  const guardLink = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isDirty()) return clearEdits();
    e.preventDefault();
    leaveEdits(() => router.push(href));
  };

  // Until the global car picker exists (M4), the layout's guides are picked here.
  const guide = data?.guides.find((g) => g.id === params.get("guide")) ?? data?.guides[0] ?? null;
  const { data: cornerGuides } = useCornerGuides(guide?.id ?? null);
  const chips = useMemo(() => (cornerGuides ? chipsFor(cornerGuides) : null), [cornerGuides]);

  const cornerId = params.get("corner");
  const listOpen = params.get("panel") === "corners";
  const setupOpen = params.get("panel") === "setup" && guide !== null;
  const videoOpen = params.get("panel") === "video" && guide !== null;
  // The corner the playing video is at; reported by the dot layer only when it changes.
  const [videoCorner, setVideoCorner] = useState<string | null>(null);

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
  const selectCorner = (id: string) => {
    leaveEdits(() => setParams({ corner: id, panel: null }));
  };
  const closePanel = () => {
    leaveEdits(() => setParams({ corner: null, panel: null }));
  };
  const openSetup = () => {
    leaveEdits(() => setParams({ panel: "setup", corner: null }));
  };
  const openVideo = () => {
    leaveEdits(() => setParams({ panel: "video", corner: null }));
  };
  /** While the video panel is open, a corner on the map seeks the video to its mark. */
  const seekToCorner = (id: string) => {
    const corner = data?.corners.find((c) => c.id === id);
    const mark = guide?.video?.marks.find((m) => m.cornerId === id);
    if (!corner) return;
    if (!mark) return toast.show(`T${corner.number} isn't marked yet.`);
    setSeekRequest((r) => ({ sec: mark.sec, id: (r?.id ?? 0) + 1 }));
  };
  const onMarker = (id: string) => (videoOpen ? seekToCorner(id) : selectCorner(id));
  /**
   * `[` / `]` with the video panel open: seek to the previous or next marked corner in lap
   * order from the one the video is at, like a marker click; the panel stays open.
   */
  const stepVideo = (delta: 1 | -1) => {
    const marked = new Set(guide?.video?.marks.map((m) => m.cornerId));
    const inLap = [...(data?.corners ?? [])]
      .sort((a, b) => a.order - b.order)
      .filter((c) => marked.has(c.id));
    if (inLap.length === 0) return;
    const index = inLap.findIndex((c) => c.id === videoCorner);
    const target =
      index < 0
        ? inLap[delta === 1 ? 0 : inLap.length - 1]
        : inLap[(index + delta + inLap.length) % inLap.length];
    if (target) onMarker(target.id);
  };
  const toggleEdit = () => {
    leaveEdits(() => setParams({ edit: editing ? null : "1" }));
  };
  const toggleList = () => {
    leaveEdits(() => setParams({ panel: listOpen ? null : "corners", corner: null }));
  };

  // Shortcuts go through the same handlers as the buttons, so unsaved-edit
  // protection applies. Bubble phase: the Escape handlers are unaffected.
  const runShortcut = (action: ShortcutAction) => {
    const all = data?.corners ?? [];
    const step = (delta: 1 | -1) => {
      if (videoOpen) return stepVideo(delta);
      if (all.length === 0) return;
      const index = all.findIndex((c) => c.id === cornerId);
      const target =
        index < 0
          ? all[delta === 1 ? 0 : all.length - 1]
          : all[(index + delta + all.length) % all.length];
      if (target) selectCorner(target.id);
    };
    switch (action) {
      case "prev-corner":
        return step(-1);
      case "next-corner":
        return step(1);
      case "zoom-in":
        return canvas.current?.zoomBy(1.5);
      case "zoom-out":
        return canvas.current?.zoomBy(1 / 1.5);
      case "reset-view":
        return canvas.current?.reset();
      case "toggle-list":
        return toggleList();
      case "toggle-edit":
        return toggleEdit();
      case "help":
        return setHelpOpen(true);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e);
      if (!action) return;
      e.preventDefault();
      runShortcut(action);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A dialog or menu over the pick (discard, far point, Add car, Layers,
      // More) owns this Escape; the next one cancels the pick.
      if (
        document.querySelector(
          "[role=alertdialog][data-state=open], [role=dialog][data-state=open], [role=menu][data-state=open]",
        )
      )
        return;
      // Capture phase + preventDefault: cancelling a pick must not also close the panel.
      e.preventDefault();
      setPicking(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [picking]);

  // Keep the selected corner out from under the side panel / bottom sheet.
  // Edit mode, its loaded form and a pick change the sheet's height on a
  // phone, so re-measure then too.
  const guidesLoaded = cornerGuides !== undefined;
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
  }, [selectedFraction, editing, picking, guidesLoaded]);

  const selectedGuide = cornerGuides?.find((g) => g.cornerId === cornerId);
  const pick = useLinePointPick({
    guideId: guide?.id ?? "",
    cornerId: cornerId ?? "",
    guide: selectedGuide,
    cornerFraction: selectedFraction,
    lengthMeters: data?.layout?.lengthMeters ?? null,
    point: picking ?? "apex",
    onDone: () => {
      setPicking(null);
      setPickError(null);
    },
    onError: setPickError,
  });
  const lines = useMemo(
    () =>
      data?.layout?.outlinePath && cornerGuides
        ? carLines({
            outlinePath: data.layout.outlinePath,
            lengthMeters: data.layout.lengthMeters,
            corners: data.corners,
            cornerGuides,
          })
        : [],
    [data, cornerGuides],
  );

  if (isPending) return <Message>Loading track…</Message>;
  if (error) return <Message>Could not load the track: {error.message}</Message>;
  if (!data) return <Message>This track doesn’t exist (it may have been deleted).</Message>;

  const { track, layouts, layout, corners, complexes, guides } = data;
  const racingLine = layout ? getRacingLine(layout) : null;
  const hasTerrain = corners.some((c) => terrainOf(c) !== null);
  const currentGuideLabel = guide
    ? guideLabel(guide, data.carClasses ?? [], data.cars ?? [])
    : null;
  // The setup or video panel and a selected corner share the one panel: setup/video win.
  const selected = setupOpen || videoOpen ? null : (corners.find((c) => c.id === cornerId) ?? null);
  // With the video open, the selected marker is the corner the video is at.
  const markerId = videoOpen ? videoCorner : (selected?.id ?? null);
  const topPracticeHref = layout
    ? practiceHref(track.id, layout.id, params.get("guide"), selectedCorner?.number ?? null)
    : null;

  const topBar = (
    <>
      <Button asChild size="icon" variant="ghost">
        <Link
          href="/"
          onClick={(e) => guardLink(e, "/")}
          aria-label="Back to tracks"
          title="Back to tracks"
        >
          <ArrowLeft aria-hidden />
        </Link>
      </Button>
      <h1 className="max-w-[40vw] truncate text-sm font-semibold">
        {track.aliases[0] ?? track.name}
        {layout && layouts.length === 1 && (
          <span className="font-normal text-muted"> · {layout.name}</span>
        )}
      </h1>
      {layouts.length > 1 && (
        <Select
          aria-label="Layout"
          value={layout?.id}
          onChange={(e) => {
            const layoutId = e.target.value;
            leaveEdits(() => setParams({ layout: layoutId, corner: null }));
          }}
          className="h-9 w-auto"
        >
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      )}
      {topPracticeHref && (
        <Button asChild size="sm" variant="secondary">
          <Link href={topPracticeHref} onClick={(e) => guardLink(e, topPracticeHref)}>
            <Play aria-hidden />
            Practice
          </Link>
        </Button>
      )}
      <DeleteTrackButton trackId={track.id} trackName={track.name} />
    </>
  );

  if (!layout) {
    return (
      <TrackViewShell
        topBar={topBar}
        canvas={<Message>This track has no layouts yet.</Message>}
        controls={null}
        panel={null}
      />
    );
  }

  const carPicker = (
    <Select
      aria-label="Car"
      value={guide?.id ?? "__none__"}
      onChange={(e) => {
        const value = e.target.value;
        if (value === "__add__") {
          // Opens after the discard dialog has closed, so the two never overlap.
          confirmDiscard(() => setAddingCar(true));
          return;
        }
        leaveEdits(() => setParams({ guide: value }));
      }}
      className="h-10 w-auto max-w-44 pointer-coarse:h-11 max-sm:w-28"
    >
      {guides.length === 0 && (
        <option value="__none__" disabled>
          No car yet
        </option>
      )}
      {guides.map((g) => (
        <option key={g.id} value={g.id}>
          {guideLabel(g, data.carClasses ?? [], data.cars ?? [])}
        </option>
      ))}
      <option value="__add__">+ Add car…</option>
    </Select>
  );

  const cheatSheetHref = printHref(track.id, layout.id, guide?.id ?? null);
  const toolbar = (
    <MapToolbar
      hasMap={layout.outlinePath !== null}
      onZoomIn={() => canvas.current?.zoomBy(1.5)}
      onZoomOut={() => canvas.current?.zoomBy(1 / 1.5)}
      onReset={() => canvas.current?.reset()}
      chips={{ on: showChips, disabled: !guide, toggle: toggleChips }}
      terrain={{ on: showTerrain && hasTerrain, disabled: !hasTerrain, toggle: toggleTerrain }}
      racingLine={{
        on: showRacingLine && (racingLine !== null || lines.length > 0),
        disabled: !racingLine && lines.length === 0,
        toggle: toggleRacingLine,
      }}
      editing={editing}
      onToggleEdit={toggleEdit}
      carPicker={carPicker}
      listOpen={listOpen}
      onToggleList={toggleList}
      redoMap={{
        available: layout.outlineSource === "osm",
        active: redoingMap,
        open: () => {
          leaveEdits(() => setRedoingMap(true));
        },
      }}
      carSetup={{ available: guide !== null, open: openSetup }}
      video={{ available: guide !== null, open: openVideo }}
      cheatSheetHref={cheatSheetHref}
      onCheatSheetClick={(e) => guardLink(e, cheatSheetHref)}
      onShowShortcuts={() => setHelpOpen(true)}
    />
  );

  const controls = (
    <>
      {toolbar}
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );

  const cornerPracticeHref = selected
    ? practiceHref(track.id, layout.id, params.get("guide"), selected.number)
    : "";
  const panel = (
    <>
      <SidePanel
        open={selected !== null || listOpen || setupOpen || videoOpen}
        title={
          setupOpen && currentGuideLabel
            ? `Setup · ${currentGuideLabel}`
            : videoOpen && currentGuideLabel
              ? `Video · ${currentGuideLabel}`
              : selected
                ? cornerTitle(selected)
                : "Corners"
        }
        onClose={closePanel}
      >
        {setupOpen && guide && currentGuideLabel ? (
          <CarSetup
            guide={guide}
            label={currentGuideLabel}
            editing={editing}
            trackId={track.id}
            onDirtyChange={onSetupDirty}
          />
        ) : videoOpen && guide && currentGuideLabel ? (
          <VideoPanel
            key={guide.id}
            guide={guide}
            label={currentGuideLabel}
            corners={corners}
            layout={layout}
            trackId={track.id}
            playerRef={playerRef}
            seekRequest={seekRequest}
            discards={discards}
            onDirtyChange={onVideoDirty}
          />
        ) : selected ? (
          <CornerDetails
            corner={selected}
            complexes={complexes}
            allCorners={corners}
            onSelect={selectCorner}
            actions={
              <Button asChild variant="secondary" className="w-full">
                <Link href={cornerPracticeHref} onClick={(e) => guardLink(e, cornerPracticeHref)}>
                  <Play aria-hidden />
                  Practice from T{selected.number}
                </Link>
              </Button>
            }
            hideNotes={editing}
            guide={
              editing ? (
                <div className="space-y-4">
                  <CornerNotesForm
                    key={selected.id}
                    trackId={track.id}
                    corner={selected}
                    onDirtyChange={onCornerDirty}
                  />
                  {guide && currentGuideLabel && !cornerGuides ? (
                    // The form's draft starts from the stored values: wait for them.
                    <p className="text-sm text-muted">Loading…</p>
                  ) : guide && currentGuideLabel ? (
                    <CornerGuideForm
                      key={`${guide.id}:${selected.id}`}
                      guideId={guide.id}
                      cornerId={selected.id}
                      label={`${currentGuideLabel} · T${selected.number}`}
                      guide={selectedGuide}
                      onDirtyChange={onGuideDirty}
                    >
                      <LinePoints
                        guideId={guide.id}
                        cornerId={selected.id}
                        guide={selectedGuide}
                        cornerFraction={selectedFraction}
                        lengthMeters={layout.lengthMeters}
                        hasOutline={layout.outlinePath !== null}
                        picking={picking}
                        onPickStart={(p) => {
                          setPickError(null);
                          setPicking(p);
                        }}
                        onPickEnd={() => setPicking(null)}
                        onError={setPickError}
                      />
                      {pickError && (
                        <p role="status" className="text-sm text-danger">
                          {pickError}
                        </p>
                      )}
                    </CornerGuideForm>
                  ) : (
                    <section className="space-y-2 rounded-lg border border-dashed border-border p-3 text-muted">
                      <p>Add a car to record its values for this corner.</p>
                      <Button type="button" variant="outline" onClick={() => setAddingCar(true)}>
                        Add car
                      </Button>
                    </section>
                  )}
                </div>
              ) : (
                guide &&
                currentGuideLabel && (
                  <CornerGuideSection guide={selectedGuide} label={currentGuideLabel} />
                )
              )
            }
          />
        ) : (
          <CornerList corners={corners} onSelect={selectCorner} />
        )}
      </SidePanel>
      {addingCar && (
        <AddCarDialog
          open
          onOpenChange={setAddingCar}
          track={track}
          layout={layout}
          corners={corners}
          carClasses={data.carClasses ?? []}
          onAdded={(guideId) => {
            setAddingCar(false);
            setDirty({});
            setPicking(null);
            setPickError(null);
            // A video panel left in the URL (from before there was a car) must not pop
            // open for the new car; setup and the corner list stay as they were.
            setParams(
              params.get("panel") === "video"
                ? { guide: guideId, panel: null }
                : { guide: guideId },
            );
          }}
        />
      )}
    </>
  );

  if (!layout.outlinePath) {
    return (
      <TrackViewShell
        topBar={topBar}
        canvas={<NoOutline track={track} layout={layout} corners={corners} onSelect={onMarker} />}
        controls={controls}
        panel={panel}
      />
    );
  }

  return (
    <TrackViewShell
      topBar={topBar}
      canvas={
        <>
          <TrackCanvas
            ref={canvas}
            outlinePath={layout.outlinePath}
            rotation={layout.rotation}
            lengthMeters={layout.lengthMeters}
            trackLayers={() =>
              showRacingLine && (
                <>
                  {racingLine && <RacingLineLayer line={racingLine} dim={lines.length > 0} />}
                  <CarLinesLayer lines={lines} />
                </>
              )
            }
            onPick={
              editing && picking && cornerGuides
                ? (f) =>
                    void pick(f).catch((e: Error) => setPickError(`Could not save: ${e.message}`))
                : undefined
            }
            label={`Map of ${track.name}, ${layout.name} layout`}
            overlay={(ctx) => (
              <>
                <VideoDotLayer
                  ctx={ctx}
                  playerRef={playerRef}
                  active={videoOpen}
                  video={guide?.video ?? null}
                  corners={corners}
                  layout={layout}
                  onCornerChange={setVideoCorner}
                />
                <CornerMarkers
                  ctx={ctx}
                  layout={layout}
                  corners={corners}
                  selectedId={markerId}
                  onSelect={onMarker}
                  chips={showChips ? chips : null}
                  terrain={showTerrain}
                />
              </>
            )}
          />
          {layout.outlineSource === "osm" && (
            <OsmAttribution className="absolute right-2 bottom-1 z-10 rounded bg-background/80 px-1.5 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]" />
          )}
        </>
      }
      controls={controls}
      panel={
        redoingMap ? (
          <SidePanel open title="Redo map from OpenStreetMap" onClose={() => setRedoingMap(false)}>
            <AddMapPanel
              track={track}
              layout={layout}
              corners={corners}
              onClose={() => setRedoingMap(false)}
              replace
            />
          </SidePanel>
        ) : (
          panel
        )
      }
    />
  );
}

function practiceHref(track: string, layout: string, guide: string | null, corner: number | null) {
  const q = new URLSearchParams({ track, layout });
  if (guide) q.set("guide", guide);
  if (corner !== null) q.set("corner", String(corner));
  return `/tracks/practice/?${q}`;
}

function printHref(track: string, layout: string, guide: string | null) {
  const q = new URLSearchParams({ track, layout });
  if (guide) q.set("guide", guide);
  return `/tracks/print/?${q}`;
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
