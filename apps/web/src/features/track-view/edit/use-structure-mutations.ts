"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Corner, CornerComplex, Layout, Segment, Track } from "@track-day/schema";
import { useRepositories } from "@/data/provider";
import type { EntityPatch, NewEntity } from "@/data/repositories";
import { queryKeys } from "@/data/query-keys";
import { downscaleImage } from "@/shared/lib/image";

// Mutations for the track's structure (M2): the track, its layouts, corners,
// complexes, segments and map image. Anything that can rename a track also
// refreshes the home list, so these invalidate every track query.

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.tracks() });
}

export function useSaveTrack() {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntityPatch<Track> }) =>
      repos.tracks.update(id, patch),
    onSuccess: invalidate,
  });
}

export function useSaveLayout() {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntityPatch<Layout> }) =>
      repos.layouts.update(id, patch),
    onSuccess: invalidate,
  });
}

export function useAddLayout() {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      input: Pick<Layout, "trackId" | "name" | "lengthMeters" | "direction" | "rotation">,
    ) =>
      repos.layouts.create({
        ...input,
        mapAssetId: null,
        outlinePath: null,
        racingLine: null,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteLayout() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layoutId: string) => repos.layoutDeletion.deleteLayout(layoutId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.all }),
  });
}

/** Stores a downscaled copy of the picked image as the layout's map; the old one goes. */
export function useSetMapImage() {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ layout, file }: { layout: Layout; file: File | null }) => {
      let mapAssetId: string | null = null;
      if (file) {
        const { blob, width, height } = await downscaleImage(file);
        mapAssetId = (await repos.assets.put(blob, { fileName: file.name, width, height })).id;
      }
      await repos.layouts.update(layout.id, { mapAssetId });
      if (layout.mapAssetId) await repos.assets.remove(layout.mapAssetId);
    },
    onSuccess: invalidate,
  });
}

export function useSaveCornerFacts() {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntityPatch<Corner> }) =>
      repos.corners.update(id, patch),
    onSuccess: invalidate,
  });
}

/** A new corner at the end of the lap, numbered after the highest one. */
export function useAddCorner() {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ layoutId, corners }: { layoutId: string; corners: Corner[] }) =>
      repos.corners.create({
        layoutId,
        number: Math.max(0, ...corners.map((c) => c.number)) + 1,
        name: null,
        direction: null,
        type: null,
        elevation: null,
        camber: null,
        pathPosition: null,
        labelOffset: null,
        order: Math.max(-1, ...corners.map((c) => c.order)) + 1,
        distanceFromStartMeters: null,
        notes: "",
        commonMistakes: [],
      }),
    onSuccess: invalidate,
  });
}

export function useReorderCorners() {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ layoutId, cornerIds }: { layoutId: string; cornerIds: string[] }) =>
      repos.corners.reorder(layoutId, cornerIds),
    onSuccess: invalidate,
  });
}

export function useDeleteCorner() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cornerId: string) => repos.cornerDeletion.deleteCorner(cornerId),
    // Corner guides and video marks change too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.all }),
  });
}

type SectionKind = "complexes" | "segments";
type SectionOf<K extends SectionKind> = K extends "complexes" ? CornerComplex : Segment;

/** Create (no id) or update (with id) a complex or a segment. */
export function useSaveSection<K extends SectionKind>(kind: K) {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, value }: { id: string | null; value: NewEntity<SectionOf<K>> }) => {
      const repo = repos[kind] as unknown as {
        create(v: NewEntity<SectionOf<K>>): Promise<SectionOf<K>>;
        update(id: string, v: EntityPatch<SectionOf<K>>): Promise<SectionOf<K>>;
      };
      return id ? repo.update(id, value) : repo.create(value);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSection(kind: SectionKind) {
  const repos = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => repos[kind].remove(id),
    onSuccess: invalidate,
  });
}
