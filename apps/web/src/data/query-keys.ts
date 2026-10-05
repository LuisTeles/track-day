/** TanStack Query keys, centralized so mutations can invalidate precisely. */
export const queryKeys = {
  all: ["track-day"] as const,
  tracks: () => [...queryKeys.all, "tracks"] as const,
  track: (id: string) => [...queryKeys.tracks(), id] as const,
  trackView: (trackId: string, layoutId: string | null) =>
    [...queryKeys.track(trackId), "view", layoutId] as const,
  cornerGuides: (guideId: string) => [...queryKeys.all, "corner-guides", guideId] as const,
};
