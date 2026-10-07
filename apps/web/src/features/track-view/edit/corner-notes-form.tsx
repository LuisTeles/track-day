"use client";

import type { Corner } from "@track-day/schema";
import { useEffect, useId, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useSaveCorner } from "./use-edit-mutations";

/** Notes that hold for any car. */
export function CornerNotesForm({
  trackId,
  corner,
  onDirtyChange,
}: {
  trackId: string;
  corner: Corner;
  onDirtyChange(dirty: boolean): void;
}) {
  const [saved, setSaved] = useState({
    notes: corner.notes,
    commonMistakes: corner.commonMistakes,
  });
  const [notes, setNotes] = useState(saved.notes);
  const [mistakes, setMistakes] = useState(saved.commonMistakes);
  const save = useSaveCorner(trackId);
  const id = useId();

  const dirty =
    notes !== saved.notes || JSON.stringify(mistakes) !== JSON.stringify(saved.commonMistakes);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // Unmounting drops the draft, so it no longer counts as unsaved.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function reset() {
    setNotes(saved.notes);
    setMistakes(saved.commonMistakes);
    save.reset();
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="Corner notes (all cars)"
      onSubmit={(e) => {
        e.preventDefault();
        const commonMistakes = mistakes.map((m) => m.trim()).filter(Boolean);
        save.mutate(
          { id: corner.id, patch: { notes, commonMistakes } },
          {
            onSuccess: () => {
              setMistakes(commonMistakes);
              setSaved({ notes, commonMistakes });
            },
          },
        );
      }}
    >
      <h3 className="font-medium">Corner notes (all cars)</h3>
      <div className="space-y-1">
        <Label htmlFor={`${id}-notes`}>Corner notes</Label>
        <Textarea
          id={`${id}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-24"
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Common mistakes</legend>
        {mistakes.map((m, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={`Mistake ${i + 1}`}
              value={m}
              onChange={(e) => setMistakes(mistakes.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <Button
              variant="outline"
              aria-label={`Remove mistake ${i + 1}`}
              onClick={() => setMistakes(mistakes.filter((_, j) => j !== i))}
            >
              ×
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setMistakes([...mistakes, ""])}>
          Add mistake
        </Button>
      </fieldset>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending} aria-label="Save corner notes">
          {save.error ? "Retry" : "Save"}
        </Button>
        <Button variant="outline" onClick={reset} disabled={save.isPending}>
          Cancel
        </Button>
        <p aria-live="polite" className="text-sm text-muted">
          {save.isSuccess && !dirty && "Saved"}
        </p>
      </div>
    </form>
  );
}
