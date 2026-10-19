"use client";

import type { Track } from "@track-day/schema";
import { useId } from "react";
import { Input } from "@/shared/ui/input";
import { Field } from "./layout-fields";

/** A track's editable text fields as typed. `aliases` is comma-separated. */
export interface TrackDraft {
  name: string;
  aliases: string;
  city: string;
  country: string;
}

export type TrackValues = Pick<Track, "name" | "aliases" | "city" | "country">;

export const EMPTY_TRACK_DRAFT: TrackDraft = { name: "", aliases: "", city: "", country: "" };

export const trackDraftOf = (track: TrackValues): TrackDraft => ({
  name: track.name,
  aliases: track.aliases.join(", "),
  city: track.city ?? "",
  country: track.country ?? "",
});

/** Validates a draft; empty optional fields become null (or an empty alias list). */
export function readTrackDraft(
  draft: TrackDraft,
): { ok: true; value: TrackValues } | { ok: false; errors: { name?: string } } {
  const name = draft.name.trim();
  if (!name) return { ok: false, errors: { name: "Give the track a name." } };
  return {
    ok: true,
    value: {
      name,
      aliases: draft.aliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      city: draft.city.trim() || null,
      country: draft.country.trim() || null,
    },
  };
}

/** Name, short names and place of a track. */
export function TrackFields({
  value,
  onChange,
  error,
  aliasesLabel = "Short name",
}: {
  value: TrackDraft;
  onChange(draft: TrackDraft): void;
  error?: string;
  aliasesLabel?: string;
}) {
  const id = useId();
  const set = <K extends keyof TrackDraft>(key: K, v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${id}-name`} label="Track name" error={error}>
        <Input
          id={`${id}-name`}
          value={value.name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-name-error` : undefined}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field id={`${id}-aliases`} label={aliasesLabel}>
        <Input
          id={`${id}-aliases`}
          value={value.aliases}
          onChange={(e) => set("aliases", e.target.value)}
        />
      </Field>
      <Field id={`${id}-city`} label="City">
        <Input id={`${id}-city`} value={value.city} onChange={(e) => set("city", e.target.value)} />
      </Field>
      <Field id={`${id}-country`} label="Country">
        <Input
          id={`${id}-country`}
          value={value.country}
          onChange={(e) => set("country", e.target.value)}
        />
      </Field>
    </div>
  );
}
