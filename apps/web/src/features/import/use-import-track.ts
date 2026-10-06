import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrackImportPayload } from "@track-day/schema";
import { useRouter } from "next/navigation";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";

/** Saves an imported track in one transaction, then opens it. */
export function useImportTrack() {
  const { trackImport } = useRepositories();
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (payload: TrackImportPayload) => trackImport.importTrack(payload),
    onSuccess: async ({ trackId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      router.push(`/tracks/view/?track=${trackId}`);
    },
  });
}
