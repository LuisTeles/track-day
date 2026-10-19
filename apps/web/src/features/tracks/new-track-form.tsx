"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import { Button } from "@/shared/ui/button";
import {
  LayoutFields,
  readLayoutDraft,
  type LayoutDraft,
  type LayoutErrors,
  type LayoutValues,
} from "./layout-fields";
import {
  EMPTY_TRACK_DRAFT,
  readTrackDraft,
  TrackFields,
  type TrackDraft,
  type TrackValues,
} from "./track-fields";

const EMPTY_LAYOUT: LayoutDraft = {
  name: "Full circuit",
  lengthMeters: "",
  direction: "",
  rotation: "",
};

/** Creates a track with its first layout by hand, then opens it to add corners. */
export function NewTrackForm() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [track, setTrack] = useState<TrackDraft>(EMPTY_TRACK_DRAFT);
  const [layout, setLayout] = useState<LayoutDraft>(EMPTY_LAYOUT);
  const [errors, setErrors] = useState<{ track?: string; layout: LayoutErrors }>({ layout: {} });
  const create = useMutation({
    mutationFn: async (input: { track: TrackValues; layout: LayoutValues }) => {
      const created = await repos.tracks.create({ ...input.track, sims: [] });
      const { id: layoutId } = await repos.layouts.create({
        trackId: created.id,
        ...input.layout,
        mapAssetId: null,
        outlinePath: null,
        racingLine: null,
      });
      return { trackId: created.id, layoutId };
    },
    onSuccess: async ({ trackId, layoutId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tracks() });
      const q = new URLSearchParams({
        track: trackId,
        layout: layoutId,
        edit: "1",
        panel: "corners",
      });
      router.push(`/tracks/view/?${q}`);
    },
  });

  function submit() {
    if (create.isPending) return;
    const t = readTrackDraft(track);
    const l = readLayoutDraft(layout);
    setErrors({ track: t.ok ? undefined : t.errors.name, layout: l.ok ? {} : l.errors });
    if (t.ok && l.ok) create.mutate({ track: t.value, layout: l.value });
  }

  return (
    <form
      className="max-w-2xl space-y-6"
      aria-label="New track"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Track</legend>
        <TrackFields value={track} onChange={setTrack} error={errors.track} />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-1 font-medium">First layout</legend>
        <p className="text-sm text-muted">
          The lap length places corners from their distance and finds the right loop when adding a
          map from OpenStreetMap. You can add more layouts later.
        </p>
        <LayoutFields value={layout} onChange={setLayout} errors={errors.layout} />
      </fieldset>
      {create.error && (
        <p role="alert" className="text-sm text-danger">
          Could not create the track: {create.error.message}
        </p>
      )}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Create track"}
      </Button>
    </form>
  );
}
