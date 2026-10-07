"use client";

import { BrakePressure, CUE_MAX_LENGTH, type CornerGuide } from "@track-day/schema";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { draftFrom, parseDraft, type GuideDraft } from "./corner-guide-draft";
import { useSaveCornerGuide } from "./use-edit-mutations";

type Errors = Partial<Record<keyof GuideDraft, string>>;

/** One car's values and notes for one corner. */
export function CornerGuideForm({
  guideId,
  cornerId,
  label,
  guide,
  onDirtyChange,
  children,
}: {
  guideId: string;
  cornerId: string;
  label: string;
  guide: CornerGuide | undefined;
  onDirtyChange(dirty: boolean): void;
  children?: ReactNode;
}) {
  // The record as last saved here, until the refetched prop catches up. A
  // line point saved from the map also updates the prop: the newest wins.
  const [local, setLocal] = useState<CornerGuide | undefined>(undefined);
  const saved = !local || (guide && guide.updatedAt >= local.updatedAt) ? guide : local;
  const [draft, setDraft] = useState(() => draftFrom(guide));
  const [errors, setErrors] = useState<Errors>({});
  const save = useSaveCornerGuide();
  const id = useId();

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(saved));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = (field: keyof GuideDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  function submit() {
    const result = parseDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(
      { guideId, cornerId, existing: saved, patch: result.patch },
      { onSuccess: (next) => setLocal(next) },
    );
  }

  const field = (name: keyof GuideDraft, text: string, input: "number" | "text" = "number") => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${name}`}>{text}</Label>
      <Input
        id={`${id}-${name}`}
        inputMode={input === "number" ? "decimal" : undefined}
        value={draft[name]}
        onChange={(e) => set(name)(e.target.value)}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
      />
      {errors[name] && (
        <p id={`${id}-${name}-error`} className="text-xs text-danger">
          {errors[name]}
        </p>
      )}
    </div>
  );
  const notes = (name: keyof GuideDraft, text: string) => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${name}`}>{text}</Label>
      <Textarea
        id={`${id}-${name}`}
        value={draft[name]}
        onChange={(e) => set(name)(e.target.value)}
        className="h-20"
      />
    </div>
  );

  return (
    <form
      aria-label={label}
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="font-medium">{label}</h3>
      {children}
      <div className="grid grid-cols-3 gap-2">
        {field("entrySpeedKmh", "Entry speed (km/h)")}
        {field("minSpeedKmh", "Minimum speed (km/h)")}
        {field("exitSpeedKmh", "Exit speed (km/h)")}
        {field("gear", "Gear")}
        {field("downshiftTo", "Downshift to")}
        {field("brakeMarkerMeters", "Brake board (m)")}
      </div>
      {field("brakeReference", "Brake reference", "text")}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-brakePressure`}>Brake pressure</Label>
          <select
            id={`${id}-brakePressure`}
            value={draft.brakePressure}
            onChange={(e) => set("brakePressure")(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">—</option>
            {BrakePressure.options.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {field("brakePressurePct", "Pressure (%)")}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <Label htmlFor={`${id}-cue`}>Cue</Label>
          <span className="text-xs text-muted tabular-nums">
            {draft.cue.trim().length}/{CUE_MAX_LENGTH}
          </span>
        </div>
        <Input
          id={`${id}-cue`}
          value={draft.cue}
          onChange={(e) => set("cue")(e.target.value)}
          aria-invalid={errors.cue ? true : undefined}
          aria-describedby={errors.cue ? `${id}-cue-error` : undefined}
        />
        {errors.cue && (
          <p id={`${id}-cue-error`} className="text-xs text-danger">
            {errors.cue}
          </p>
        )}
      </div>
      {notes("throttleNotes", "Throttle notes")}
      {notes("trailBrakeNotes", "Trail-brake notes")}
      {notes("notes", "Car notes")}
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending} aria-label="Save car values">
          {save.error ? "Retry" : "Save"}
        </Button>
        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => {
            setDraft(draftFrom(saved));
            setErrors({});
            save.reset();
          }}
        >
          Cancel
        </Button>
        <p aria-live="polite" className="text-sm text-muted">
          {save.isSuccess && !dirty && "Saved"}
        </p>
      </div>
    </form>
  );
}
