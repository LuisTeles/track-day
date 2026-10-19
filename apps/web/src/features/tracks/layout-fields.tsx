"use client";

import type { Layout } from "@track-day/schema";
import { useId } from "react";
import { parseLapLength } from "@/features/import/known-facts";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";

/** A layout's editable fields as typed: strings, so half-typed numbers survive. */
export interface LayoutDraft {
  name: string;
  lengthMeters: string;
  direction: "" | "clockwise" | "anticlockwise";
  rotation: string;
}

export type LayoutValues = Pick<Layout, "name" | "lengthMeters" | "direction" | "rotation">;
export type LayoutErrors = Partial<Record<"name" | "lengthMeters" | "rotation", string>>;

export const layoutDraftOf = (layout: LayoutValues): LayoutDraft => ({
  name: layout.name,
  lengthMeters: layout.lengthMeters === null ? "" : String(layout.lengthMeters),
  direction: layout.direction ?? "",
  rotation: layout.rotation === null ? "" : String(layout.rotation),
});

/** Validates a draft; empty optional fields become null. */
export function readLayoutDraft(
  draft: LayoutDraft,
): { ok: true; value: LayoutValues } | { ok: false; errors: LayoutErrors } {
  const errors: LayoutErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = "Give the layout a name.";
  const lengthMeters = parseLapLength(draft.lengthMeters);
  if (draft.lengthMeters.trim() !== "" && lengthMeters === null)
    errors.lengthMeters = "Enter the lap length in meters, e.g. 4309.";
  const rotation = draft.rotation.trim() === "" ? null : Number(draft.rotation);
  if (rotation !== null && !(Number.isFinite(rotation) && Math.abs(rotation) <= 360))
    errors.rotation = "Enter degrees between -360 and 360.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, lengthMeters, direction: draft.direction || null, rotation },
  };
}

/** Name, lap length, direction and (optionally) display rotation of a layout. */
export function LayoutFields({
  value,
  onChange,
  errors,
  nameLabel = "Layout name",
  showRotation = false,
}: {
  value: LayoutDraft;
  onChange(draft: LayoutDraft): void;
  errors: LayoutErrors;
  nameLabel?: string;
  showRotation?: boolean;
}) {
  const id = useId();
  const set = <K extends keyof LayoutDraft>(key: K, v: LayoutDraft[K]) =>
    onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${id}-name`} label={nameLabel} error={errors.name}>
        <Input
          id={`${id}-name`}
          value={value.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field id={`${id}-length`} label="Lap length (m)" error={errors.lengthMeters}>
        <Input
          id={`${id}-length`}
          inputMode="numeric"
          value={value.lengthMeters}
          aria-invalid={errors.lengthMeters ? true : undefined}
          aria-describedby={errors.lengthMeters ? `${id}-length-error` : undefined}
          onChange={(e) => set("lengthMeters", e.target.value)}
        />
      </Field>
      <Field id={`${id}-direction`} label="Direction">
        <Select
          id={`${id}-direction`}
          value={value.direction}
          onChange={(e) => set("direction", e.target.value as LayoutDraft["direction"])}
        >
          <option value="">Not sure</option>
          <option value="clockwise">Clockwise</option>
          <option value="anticlockwise">Anticlockwise</option>
        </Select>
      </Field>
      {showRotation && (
        <Field id={`${id}-rotation`} label="Map rotation (°)" error={errors.rotation}>
          <Input
            id={`${id}-rotation`}
            inputMode="decimal"
            value={value.rotation}
            aria-invalid={errors.rotation ? true : undefined}
            aria-describedby={errors.rotation ? `${id}-rotation-error` : undefined}
            onChange={(e) => set("rotation", e.target.value)}
          />
        </Field>
      )}
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
