"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReferenceVideo } from "@track-day/schema";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";

/** A car's reference video (`Guide.video`); `null` removes it. */
export function useSaveVideo(trackId: string) {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guideId, video }: { guideId: string; video: ReferenceVideo | null }) =>
      repos.guides.update(guideId, { video }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.track(trackId) }),
  });
}
