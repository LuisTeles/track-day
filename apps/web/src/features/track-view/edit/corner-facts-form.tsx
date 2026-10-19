"use client";

import {
  Camber,
  CornerDirection,
  CornerType,
  Elevation,
  type Corner,
  type Layout,
} from "@track-day/schema";
import { MapPin, Trash2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Field } from "@/features/tracks/layout-fields";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { cornerTitle } from "../corner-details";
import { FormFooter, submitOnModEnter } from "./form-footer";
import { useDeleteCorner, useSaveCornerFacts } from "./use-structure-mutations";

interface FactsDraft {
  number: string;
  name: string;
  direction: string;
  type: string;
  elevation: string;
  camber: string;
  distance: string;
}

const draftOf = (c: Corner): FactsDraft => ({
  number: String(c.number),
  name: c.name ?? "",
  direction: c.direction ?? "",
  type: c.type ?? "",
  elevation: c.elevation ?? "",
  camber: c.camber ?? "",
  distance: c.distanceFromStartMeters === null ? "" : String(c.distanceFromStartMeters),
});

type Errors = Partial<Record<"number" | "distance", string>>;

/** Checks a draft against the layout; returns the patch to save or the errors. */
export function readFacts(
  draft: FactsDraft,
  corner: Corner,
  others: Corner[],
  lengthMeters: number | null,
): { ok: true; patch: Partial<Corner> } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const number = Number(draft.number);
  if (!Number.isInteger(number) || number < 1) errors.number = "Use a whole number from 1.";
  else if (others.some((c) => c.id !== corner.id && c.number === number))
    errors.number = `T${number} already exists on this layout.`;
  const distance = draft.distance.trim() === "" ? null : Number(draft.distance);
  if (distance !== null && !(Number.isFinite(distance) && distance >= 0))
    errors.distance = "Enter meters from the start line, e.g. 350.";
  else if (distance !== null && lengthMeters !== null && distance >= lengthMeters)
    errors.distance = `Must be less than the lap length (${lengthMeters} m).`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  // The selects only offer the schema's values, so "" is the one thing to map.
  const orNull = <K extends "direction" | "type" | "elevation" | "camber">(key: K) =>
    (draft[key] || null) as Corner[K];
  return {
    ok: true,
    patch: {
      number,
      name: draft.name.trim() || null,
      direction: orNull("direction"),
      type: orNull("type"),
      elevation: orNull("elevation"),
      camber: orNull("camber"),
      distanceFromStartMeters: distance,
    },
  };
}

const nice = (v: string) => v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, " ");

/** A corner's facts for every car: number, name, shape, distance, and its marker. */
export function CornerFactsForm({
  corner,
  corners,
  layout,
  placing,
  onPlaceStart,
  onPlaceEnd,
  onDirtyChange,
  onDeleted,
}: {
  corner: Corner;
  corners: Corner[];
  layout: Layout;
  placing: boolean;
  onPlaceStart(): void;
  onPlaceEnd(): void;
  onDirtyChange(dirty: boolean): void;
  onDeleted(): void;
}) {
  const [saved, setSaved] = useState(() => draftOf(corner));
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<Errors>({});
  const save = useSaveCornerFacts();
  const clear = useSaveCornerFacts();
  const remove = useDeleteCorner();
  const confirm = useConfirm();
  const id = useId();

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function submit() {
    if (save.isPending) return;
    const read = readFacts(draft, corner, corners, layout.lengthMeters);
    setErrors(read.ok ? {} : read.errors);
    if (!read.ok) return;
    save.mutate({ id: corner.id, patch: read.patch }, { onSuccess: () => setSaved(draft) });
  }

  async function deleteCorner() {
    const ok = await confirm({
      title: `Delete ${cornerTitle(corner)}?`,
      description:
        "This removes its notes and every car’s values for it, takes it out of complexes and segments, and drops its video marks. Other corners keep their numbers.",
      confirmLabel: "Delete corner",
      destructive: true,
    });
    if (!ok) return;
    onDirtyChange(false);
    remove.mutate(corner.id, { onSuccess: onDeleted });
  }

  const set = (key: keyof FactsDraft) => (e: { target: { value: string } }) =>
    setDraft({ ...draft, [key]: e.target.value });
  const choice = (key: keyof FactsDraft, label: string, options: readonly string[]) => (
    <Field id={`${id}-${key}`} label={label}>
      <Select id={`${id}-${key}`} value={draft[key]} onChange={set(key)}>
        <option value="">Not set</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {nice(o)}
          </option>
        ))}
      </Select>
    </Field>
  );
  const hasOutline = layout.outlinePath !== null;
  const positioned = corner.pathPosition !== null;

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="Corner details"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={submitOnModEnter(submit)}
    >
      <h3 className="font-medium">Corner details</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-number`} label="Number" error={errors.number}>
          <Input
            id={`${id}-number`}
            inputMode="numeric"
            value={draft.number}
            aria-invalid={errors.number ? true : undefined}
            aria-describedby={errors.number ? `${id}-number-error` : undefined}
            onChange={set("number")}
          />
        </Field>
        <Field id={`${id}-name`} label="Name">
          <Input id={`${id}-name`} value={draft.name} onChange={set("name")} />
        </Field>
        {choice("direction", "Direction", CornerDirection.options)}
        {choice("type", "Type", CornerType.options)}
        {choice("elevation", "Elevation", Elevation.options)}
        {choice("camber", "Camber", Camber.options)}
        <Field id={`${id}-distance`} label="From start (m)" error={errors.distance}>
          <Input
            id={`${id}-distance`}
            inputMode="numeric"
            value={draft.distance}
            aria-invalid={errors.distance ? true : undefined}
            aria-describedby={errors.distance ? `${id}-distance-error` : undefined}
            onChange={set("distance")}
          />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Marker</legend>
        <p className="text-sm text-muted">
          {!hasOutline
            ? "Add a map from OpenStreetMap to place markers."
            : placing
              ? "Click or tap the track where the apex is. Esc cancels."
              : positioned
                ? "Placed on the map."
                : corner.distanceFromStartMeters !== null
                  ? "Placed from its distance. Place it on the map to be exact."
                  : "Not on the map yet."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            aria-pressed={placing}
            disabled={!hasOutline}
            onClick={() => (placing ? onPlaceEnd() : onPlaceStart())}
          >
            <MapPin aria-hidden />
            Place on map
          </Button>
          {positioned && (
            <Button
              variant="outline"
              disabled={clear.isPending}
              onClick={() => clear.mutate({ id: corner.id, patch: { pathPosition: null } })}
            >
              <X aria-hidden />
              Clear position
            </Button>
          )}
        </div>
        {clear.error && (
          <p role="alert" className="text-sm text-danger">
            Could not clear: {clear.error.message}
          </p>
        )}
      </fieldset>

      <div className="space-y-1">
        <Button
          variant="outline"
          className="text-danger"
          disabled={remove.isPending}
          onClick={() => void deleteCorner()}
        >
          <Trash2 aria-hidden />
          {remove.isPending ? "Deleting…" : "Delete corner"}
        </Button>
        {remove.error && (
          <p role="alert" className="text-sm text-danger">
            Could not delete the corner: {remove.error.message}
          </p>
        )}
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <FormFooter
        dirty={dirty}
        pending={save.isPending}
        saved={save.isSuccess}
        failed={save.isError}
        saveLabel="Save corner details"
        onCancel={() => {
          setDraft(saved);
          setErrors({});
          save.reset();
        }}
      />
    </form>
  );
}
