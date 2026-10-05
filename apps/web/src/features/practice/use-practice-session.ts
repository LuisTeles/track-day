import type { CornerGuide } from "@track-day/schema";
import { useMemo } from "react";
import { guideLabel } from "@/features/track-view/guides";
import { useCornerGuides, useTrackView } from "@/features/track-view/use-track-view";

/**
 * Data for a practice session: the layout's corners in lap order and the
 * selected guide's per-corner values. The guide is `guideId` when it exists
 * on the layout, else the layout's first guide, else none.
 */
export function usePracticeSession(
  trackId: string,
  layoutId: string | null,
  guideId: string | null,
) {
  const view = useTrackView(trackId, layoutId);
  const data = view.data;
  const guide = data?.guides.find((g) => g.id === guideId) ?? data?.guides[0] ?? null;
  const cornerGuides = useCornerGuides(guide?.id ?? null);

  const byCorner = useMemo(() => {
    const map = new Map<string, CornerGuide>();
    for (const g of cornerGuides.data ?? []) map.set(g.cornerId, g);
    return map;
  }, [cornerGuides.data]);

  return {
    isPending: view.isPending || (guide !== null && cornerGuides.isPending),
    error: view.error ?? cornerGuides.error,
    data,
    guide,
    guideLabel: guide && data ? guideLabel(guide, data.carClasses ?? [], data.cars ?? []) : null,
    guideFor: (cornerId: string) => byCorner.get(cornerId) ?? null,
  };
}
