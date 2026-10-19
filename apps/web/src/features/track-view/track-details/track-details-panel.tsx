"use client";

import { SIMS, simLabel, type Layout, type SimId, type Track } from "@track-day/schema";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  LayoutFields,
  layoutDraftOf,
  readLayoutDraft,
  type LayoutDraft,
  type LayoutErrors,
} from "@/features/tracks/layout-fields";
import { readTrackDraft, trackDraftOf, TrackFields } from "@/features/tracks/track-fields";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";
import { FormFooter, submitOnModEnter } from "../edit/form-footer";
import {
  useAddLayout,
  useDeleteLayout,
  useSaveLayout,
  useSaveTrack,
} from "../edit/use-structure-mutations";
import { MapImage } from "./map-image";

const directionLabel = { clockwise: "Clockwise", anticlockwise: "Anticlockwise" } as const;

/** The track's details, sims, the current layout and its map image (`panel=track`). */
export function TrackDetailsPanel({
  track,
  layouts,
  layout,
  editing,
  onTrackDirty,
  onLayoutDirty,
  onLayoutChange,
}: {
  track: Track;
  layouts: Layout[];
  layout: Layout | null;
  editing: boolean;
  onTrackDirty(dirty: boolean): void;
  onLayoutDirty(dirty: boolean): void;
  /** Switch to another layout (one just added), or to the default one after a delete. */
  onLayoutChange(layoutId: string | null): void;
}) {
  if (!editing) {
    return (
      <div className="space-y-5 text-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact term="Name" value={track.name} wide />
          <Fact term="Short names" value={track.aliases.join(", ") || "—"} />
          <Fact
            term="Place"
            value={[track.city, track.country].filter(Boolean).join(", ") || "—"}
          />
          <Fact term="Sims" value={track.sims.map((s) => simLabel(s.sim)).join(", ") || "—"} wide />
        </dl>
        {layout && (
          <section className="space-y-2">
            <h3 className="font-medium">Layout · {layout.name}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact
                term="Lap length"
                value={layout.lengthMeters === null ? "—" : `${layout.lengthMeters} m`}
              />
              <Fact
                term="Direction"
                value={layout.direction ? directionLabel[layout.direction] : "—"}
              />
            </dl>
          </section>
        )}
        {layout && <MapImage layout={layout} editing={false} />}
        <p className="text-muted">Turn on Edit to change the track or its layouts.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5 text-sm">
      <TrackForm key={track.id} track={track} onDirtyChange={onTrackDirty} />
      {layout && (
        <LayoutForm
          key={layout.id}
          layout={layout}
          lastLayout={layouts.length <= 1}
          onDirtyChange={onLayoutDirty}
          onDeleted={() => onLayoutChange(null)}
        />
      )}
      {layout && <MapImage layout={layout} editing />}
      <AddLayout trackId={track.id} onAdded={onLayoutChange} />
    </div>
  );
}

function Fact({ term, value, wide }: { term: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{term}</dt>
      <dd className="mt-0.5 font-medium break-words">{value}</dd>
    </div>
  );
}

function TrackForm({
  track,
  onDirtyChange,
}: {
  track: Track;
  onDirtyChange(dirty: boolean): void;
}) {
  const [saved, setSaved] = useState(() => ({
    draft: trackDraftOf(track),
    sims: track.sims.map((s) => s.sim),
  }));
  const [draft, setDraft] = useState(saved.draft);
  const [sims, setSims] = useState<SimId[]>(saved.sims);
  const [error, setError] = useState<string | undefined>();
  const save = useSaveTrack();

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved.draft) ||
    JSON.stringify(sims) !== JSON.stringify(saved.sims);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function submit() {
    if (save.isPending) return;
    const read = readTrackDraft(draft);
    setError(read.ok ? undefined : read.errors.name);
    if (!read.ok) return;
    // A sim's own track id is kept for sims that stay listed.
    const trackSims = SIMS.filter((s) => sims.includes(s.id)).map(
      (s) => track.sims.find((t) => t.sim === s.id) ?? { sim: s.id, trackId: null },
    );
    save.mutate(
      { id: track.id, patch: { ...read.value, sims: trackSims } },
      { onSuccess: () => setSaved({ draft, sims }) },
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="Track details"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={submitOnModEnter(submit)}
    >
      <h3 className="font-medium">Track</h3>
      <TrackFields value={draft} onChange={setDraft} error={error} aliasesLabel="Short names" />
      <p className="text-xs text-muted">
        Separate short names with commas; the first is the title.
      </p>
      <fieldset className="space-y-1">
        <legend className="font-medium">In these sims</legend>
        <div className="grid grid-cols-2 gap-x-3">
          {SIMS.map((s) => (
            <label key={s.id} className="flex min-h-9 items-center gap-2 pointer-coarse:min-h-11">
              <input
                type="checkbox"
                checked={sims.includes(s.id)}
                onChange={(e) =>
                  setSims(e.target.checked ? [...sims, s.id] : sims.filter((x) => x !== s.id))
                }
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      {save.error && (
        <p role="alert" className="text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <FormFooter
        dirty={dirty}
        pending={save.isPending}
        saved={save.isSuccess}
        failed={save.isError}
        saveLabel="Save track details"
        onCancel={() => {
          setDraft(saved.draft);
          setSims(saved.sims);
          setError(undefined);
          save.reset();
        }}
      />
    </form>
  );
}

function LayoutForm({
  layout,
  lastLayout,
  onDirtyChange,
  onDeleted,
}: {
  layout: Layout;
  lastLayout: boolean;
  onDirtyChange(dirty: boolean): void;
  onDeleted(): void;
}) {
  const [saved, setSaved] = useState<LayoutDraft>(() => layoutDraftOf(layout));
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<LayoutErrors>({});
  const save = useSaveLayout();
  const remove = useDeleteLayout();
  const confirm = useConfirm();

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function submit() {
    if (save.isPending) return;
    const read = readLayoutDraft(draft);
    setErrors(read.ok ? {} : read.errors);
    if (!read.ok) return;
    save.mutate({ id: layout.id, patch: read.value }, { onSuccess: () => setSaved(draft) });
  }

  async function deleteLayout() {
    const ok = await confirm({
      title: `Delete the ${layout.name} layout?`,
      description:
        "This removes its corners, complexes, segments, car guides and map image from this browser. Export a backup first if you might want it back.",
      confirmLabel: "Delete layout",
      destructive: true,
    });
    if (!ok) return;
    onDirtyChange(false);
    remove.mutate(layout.id, { onSuccess: onDeleted });
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="Layout details"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={submitOnModEnter(submit)}
    >
      <h3 className="font-medium">Layout</h3>
      <LayoutFields value={draft} onChange={setDraft} errors={errors} showRotation />
      {save.error && (
        <p role="alert" className="text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <div className="space-y-1">
        <Button
          variant="outline"
          className="text-danger"
          disabled={lastLayout || remove.isPending}
          onClick={() => void deleteLayout()}
        >
          <Trash2 aria-hidden />
          {remove.isPending ? "Deleting…" : "Delete layout"}
        </Button>
        {lastLayout && (
          <p className="text-xs text-muted">
            A track keeps at least one layout; delete the track instead.
          </p>
        )}
        {remove.error && (
          <p role="alert" className="text-danger">
            Could not delete the layout: {remove.error.message}
          </p>
        )}
      </div>
      <FormFooter
        dirty={dirty}
        pending={save.isPending}
        saved={save.isSuccess}
        failed={save.isError}
        saveLabel="Save layout"
        onCancel={() => {
          setDraft(saved);
          setErrors({});
          save.reset();
        }}
      />
    </form>
  );
}

const NEW_LAYOUT: LayoutDraft = { name: "", lengthMeters: "", direction: "", rotation: "" };

function AddLayout({ trackId, onAdded }: { trackId: string; onAdded(layoutId: string): void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(NEW_LAYOUT);
  const [errors, setErrors] = useState<LayoutErrors>({});
  const add = useAddLayout();

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Add layout
      </Button>
    );
  }

  function submit() {
    if (add.isPending) return;
    const read = readLayoutDraft(draft);
    setErrors(read.ok ? {} : read.errors);
    if (!read.ok) return;
    add.mutate(
      { trackId, ...read.value },
      {
        onSuccess: (layout) => {
          setOpen(false);
          setDraft(NEW_LAYOUT);
          onAdded(layout.id);
        },
      },
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="New layout"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="font-medium">New layout</h3>
      <LayoutFields value={draft} onChange={setDraft} errors={errors} />
      {add.error && (
        <p role="alert" className="text-danger">
          Could not add the layout: {add.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={add.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={add.isPending}>
          Add layout
        </Button>
      </div>
    </form>
  );
}
