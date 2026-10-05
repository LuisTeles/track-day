import { useQuery } from "@tanstack/react-query";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";

/**
 * Everything the track view needs for one layout: the track, its layouts
 * (for the switcher), and the selected layout's corners, complexes and guides.
 * Falls back to the track's first layout when `layoutId` is missing or stale.
 */
export function useTrackView(trackId: string, layoutId: string | null) {
  const repos = useRepositories();
  return useQuery({
    queryKey: queryKeys.trackView(trackId, layoutId),
    queryFn: async () => {
      const track = await repos.tracks.get(trackId);
      if (!track || track.deletedAt) return null;
      const layouts = await repos.layouts.listByTrack(track.id);
      const layout = layouts.find((l) => l.id === layoutId) ?? layouts[0] ?? null;
      if (!layout) return { track, layouts, layout: null, corners: [], complexes: [], guides: [] };

      const [corners, complexes, guides, carClasses, cars] = await Promise.all([
        repos.corners.listByLayout(layout.id),
        repos.complexes.listByLayout(layout.id),
        repos.guides.listByLayout(layout.id),
        repos.carClasses.list(),
        repos.cars.list(),
      ]);
      return { track, layouts, layout, corners, complexes, guides, carClasses, cars };
    },
  });
}

export type TrackViewData = NonNullable<ReturnType<typeof useTrackView>["data"]>;
