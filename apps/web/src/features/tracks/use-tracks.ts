import { useQuery } from "@tanstack/react-query";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";

export function useTracks() {
  const { tracks } = useRepositories();
  return useQuery({ queryKey: queryKeys.tracks(), queryFn: () => tracks.list() });
}
