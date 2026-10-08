"use client";

import { BrakePressure, CUE_MAX_LENGTH, type CornerGuide } from "@track-day/schema";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { draftFrom, parseDraft, type GuideDraft } from "./corner-guide-draft";
import { useSaveCornerGuide } from "./use-edit-mutations";
import { Select } from "@/shared/ui/select";

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
  // Unmounting drops the draft, so it no longer counts as unsaved.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const set = (field: keyof GuideDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  function submit() {
    if (save.isPending) return;
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

  const field = (
    name: keyof GuideDraft,
    visible: string,
    opts: { hidden?: string; unit?: string; kind?: "number" | "text"; name?: string } = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${name}`}>
        {visible}
        {opts.hidden && <span className="sr-only">{opts.hidden}</span>}
      </Label>
      <Input
        id={`${id}-${name}`}
        inputMode={(opts.kind ?? "number") === "number" ? "decimal" : undefined}
        suffix={opts.unit}
        aria-label={opts.name}
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

  const legend = "text-xs font-semibold uppercase tracking-wide text-muted";
  const grid = "grid grid-cols-2 gap-3";

  return (
    <form
      aria-label={label}
      className="space-y-4 rounded-lg border border-border p-3"
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
      <h3 className="font-medium">{label}</h3>
      <fieldset className="space-y-3">
        <legend className={legend}>Speeds</legend>
        <div data-slot="field-grid" className={grid}>
          {field("entrySpeedKmh", "Entry", { hidden: " speed (km/h)", unit: "km/h" })}
          {field("minSpeedKmh", "Minimum", { hidden: " speed (km/h)", unit: "km/h" })}
          {field("exitSpeedKmh", "Exit", { hidden: " speed (km/h)", unit: "km/h" })}
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className={legend}>Gears</legend>
        <div data-slot="field-grid" className={grid}>
          {field("gear", "Gear")}
          {field("downshiftTo", "Downshift", { hidden: " to" })}
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className={legend}>Braking</legend>
        <div data-slot="field-grid" className={grid}>
          {field("brakeMarkerMeters", "Board", { name: "Brake board (m)", unit: "m" })}
        </div>
        {field("brakeReference", "Brake reference", { kind: "text" })}
        <div data-slot="field-grid" className={grid}>
          <div className="space-y-1">
            <Label htmlFor={`${id}-brakePressure`}>Brake pressure</Label>
            <Select
              id={`${id}-brakePressure`}
              value={draft.brakePressure}
              onChange={(e) => set("brakePressure")(e.target.value)}
            >
              <option value="">—</option>
              {BrakePressure.options.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          {field("brakePressurePct", "Pressure", { hidden: " (%)", unit: "%" })}
        </div>
      </fieldset>
      {children && (
        <fieldset className="space-y-3">
          <legend className={legend}>Line</legend>
          {children}
        </fieldset>
      )}
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
      <fieldset className="space-y-3">
        <legend className={legend}>Notes</legend>
        {notes("throttleNotes", "Throttle notes")}
        {notes("trailBrakeNotes", "Trail-brake notes")}
        {notes("notes", "Car notes")}
      </fieldset>
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
          disabled={save.isPending}
          onClick={() => {
            setDraft(draftFrom(saved));
            setErrors({});
            save.reset();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending} aria-label="Save car values">
          {save.error ? "Retry" : "Save"}
        </Button>
      </div>
    </form>
  );
}
