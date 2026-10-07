"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Corner, CornerGuide } from "@track-day/schema";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import { appendNote, asManual, emptyCornerGuide, type GuidePatch } from "./corner-guide-draft";

/** Corner notes and common mistakes (any car). */
export function useSaveCorner(trackId: string) {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { notes: string; commonMistakes: string[] };
    }) => repos.corners.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.track(trackId) }),
  });
}

interface SaveGuideInput {
  guideId: string;
  cornerId: string;
  existing: CornerGuide | undefined;
  patch: GuidePatch;
}

/** One car's values for one corner; creates the record on first save. */
export function useSaveCornerGuide() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guideId, cornerId, existing, patch }: SaveGuideInput) =>
      existing
        ? repos.cornerGuides.update(existing.id, asManual(existing, patch))
        : repos.cornerGuides.create({ ...emptyCornerGuide(guideId, cornerId), ...patch }),
    onSuccess: (_saved, { guideId }) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.cornerGuides(guideId) }),
  });
}

interface AppendNoteInput {
  text: string;
  corner: Corner;
  /** The car's guide; null appends to the corner notes instead. */
  guideId: string | null;
  existing: CornerGuide | undefined;
}

/** Quick note from practice: a dated line on the car's notes (or the corner's). */
export function useAppendNote(trackId: string) {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, corner, guideId, existing }: AppendNoteInput) => {
      const now = new Date();
      if (guideId === null) {
        await repos.corners.update(corner.id, { notes: appendNote(corner.notes, text, now) });
        return;
      }
      if (existing) {
        await repos.cornerGuides.update(existing.id, {
          notes: appendNote(existing.notes, text, now),
        });
      } else {
        await repos.cornerGuides.create({
          ...emptyCornerGuide(guideId, corner.id),
          notes: appendNote("", text, now),
        });
      }
    },
    onSuccess: (_r, { guideId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.track(trackId) }),
        guideId && queryClient.invalidateQueries({ queryKey: queryKeys.cornerGuides(guideId) }),
      ]),
  });
}
