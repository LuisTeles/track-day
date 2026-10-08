"use client";

import type { Guide } from "@track-day/schema";
import { useEffect, useId, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useSaveGuideSetup } from "./edit/use-edit-mutations";

/** One car's baseline setup notes: read-only, or a form while editing. */
export function CarSetup({
  guide,
  label,
  editing,
  trackId,
  onDirtyChange,
}: {
  guide: Guide;
  label: string;
  editing: boolean;
  trackId: string;
  onDirtyChange(dirty: boolean): void;
}) {
  if (!editing) {
    return guide.setupNotes ? (
      <p className="whitespace-pre-line">{guide.setupNotes}</p>
    ) : (
      <div className="space-y-1 text-muted">
        <p>No setup notes for {label} yet.</p>
        <p>Turn on Edit to add them.</p>
      </div>
    );
  }
  return (
    <SetupForm
      key={guide.id}
      guide={guide}
      label={label}
      trackId={trackId}
      onDirtyChange={onDirtyChange}
    />
  );
}

function SetupForm({
  guide,
  label,
  trackId,
  onDirtyChange,
}: {
  guide: Guide;
  label: string;
  trackId: string;
  onDirtyChange(dirty: boolean): void;
}) {
  const [saved, setSaved] = useState(guide.setupNotes);
  const [notes, setNotes] = useState(saved);
  const save = useSaveGuideSetup(trackId);
  const id = useId();

  const dirty = notes !== saved;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // Unmounting drops the draft, so it no longer counts as unsaved.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function submit() {
    if (save.isPending) return;
    save.mutate({ guideId: guide.id, setupNotes: notes }, { onSuccess: () => setSaved(notes) });
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label={`Setup for ${label}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`${id}-notes`}>Setup notes</Label>
        <Textarea
          id={`${id}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-48"
        />
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <div className="sticky bottom-0 -mx-3 flex items-center gap-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur">
        {dirty && <span className="text-sm text-muted">Unsaved changes</span>}
        <p aria-live="polite" className="text-sm text-muted">
          {save.isSuccess && !dirty && "Saved"}
        </p>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={() => {
            setNotes(saved);
            save.reset();
          }}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending} aria-label="Save setup">
          {save.error ? "Retry" : "Save"}
        </Button>
      </div>
    </form>
  );
}
