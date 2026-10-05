/** TanStack Query keys, centralized so mutations can invalidate precisely. */
export const queryKeys = {
  all: ["track-day"] as const,
  tracks: () => [...queryKeys.all, "tracks"] as const,
  track: (id: string) => [...queryKeys.tracks(), id] as const,
};
