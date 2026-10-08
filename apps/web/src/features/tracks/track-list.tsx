"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import { Button } from "@/shared/ui/button";
import { loadSampleTracks } from "./load-samples";
import { useTracks } from "./use-tracks";

export function TrackList() {
  const { data: tracks, isPending, error } = useTracks();
  const repos = useRepositories();
  const queryClient = useQueryClient();
  const loadSamples = useMutation({
    mutationFn: () => loadSampleTracks(repos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.all }),
  });

  if (isPending) return <p className="text-muted">Loading tracks…</p>;
  if (error) return <p className="text-danger">Could not load tracks: {error.message}</p>;
  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-medium">No tracks yet</p>
        <p className="mt-1 text-sm text-muted">
          Import a track with AI from a map image, load the sample tracks (Interlagos and Suzuka) to
          explore the app, or restore a backup.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={() => loadSamples.mutate()} disabled={loadSamples.isPending}>
            {loadSamples.isPending ? "Loading…" : "Load sample tracks"}
          </Button>
        </div>
        {loadSamples.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            Could not load the samples: {loadSamples.error.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {tracks.map((track) => (
          <li key={track.id}>
            <Link
              href={`/tracks/view/?track=${track.id}`}
              className="block px-4 py-3 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
            >
              <p className="font-medium">{track.name}</p>
              {(track.aliases.length > 0 || track.country) && (
                <p className="text-sm text-muted">
                  {[track.aliases.join(", "), track.city, track.country]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
