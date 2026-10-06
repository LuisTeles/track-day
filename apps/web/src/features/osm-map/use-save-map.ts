import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import type { SaveOutlineInput } from "@/data/repositories";

export function useSaveMap(onSaved: () => void) {
  const { layoutGeometry } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveOutlineInput) => layoutGeometry.saveOutline(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      onSaved();
    },
  });
}
