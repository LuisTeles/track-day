"use client";

import { SIMS } from "@track-day/schema";
import { useId } from "react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { parseLapLength, type FactsDraft } from "./known-facts";
import { Select } from "@/shared/ui/select";

/** Optional facts the prompt treats as ground truth. Lap length helps most. */
export function KnownFactsForm({
  value,
  onChange,
}: {
  value: FactsDraft;
  onChange(draft: FactsDraft): void;
}) {
  const id = useId();
  const lengthUnusable =
    value.lengthMeters.trim() !== "" && parseLapLength(value.lengthMeters) === null;
  const set = <K extends keyof FactsDraft>(key: K, v: FactsDraft[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-2 text-sm text-muted">
        Optional. What you already know goes into the prompt as ground truth — the lap length
        matters most, since every corner distance is scaled from it.
      </legend>
      <div className="space-y-1">
        <Label htmlFor={`${id}-track`}>Track name</Label>
        <Input
          id={`${id}-track`}
          value={value.trackName}
          onChange={(e) => set("trackName", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-layout`}>Layout</Label>
        <Input
          id={`${id}-layout`}
          placeholder="GP"
          value={value.layoutName}
          onChange={(e) => set("layoutName", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-length`}>Lap length (m)</Label>
        <Input
          id={`${id}-length`}
          inputMode="numeric"
          value={value.lengthMeters}
          aria-describedby={lengthUnusable ? `${id}-length-hint` : undefined}
          onChange={(e) => set("lengthMeters", e.target.value)}
        />
        {lengthUnusable && (
          <p id={`${id}-length-hint`} className="text-xs text-danger">
            Not used — enter the lap length in meters, e.g. 4309.
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-corners`}>Number of corners</Label>
        <Input
          id={`${id}-corners`}
          inputMode="numeric"
          value={value.cornerCount}
          onChange={(e) => set("cornerCount", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-direction`}>Direction</Label>
        <Select
          id={`${id}-direction`}
          value={value.direction}
          onChange={(e) => set("direction", e.target.value as FactsDraft["direction"])}
        >
          <option value="">Not sure</option>
          <option value="clockwise">Clockwise</option>
          <option value="anticlockwise">Anticlockwise</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-sim`}>Sim</Label>
        <Select
          id={`${id}-sim`}
          value={value.sim}
          onChange={(e) => set("sim", e.target.value as FactsDraft["sim"])}
        >
          <option value="">Any</option>
          {SIMS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </fieldset>
  );
}
