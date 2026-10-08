"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Download, Flag, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast";
import { filterTracks, SEARCH_FROM } from "./filter-tracks";
import { loadSampleTracks } from "./load-samples";
import { useTracks } from "./use-tracks";

export function TrackList() {
  const { data: tracks, isPending, error } = useTracks();
  const repos = useRepositories();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const loadSamples = useMutation({
    mutationFn: () => loadSampleTracks(repos),
    onSuccess: () => {
      toast.show("Sample tracks loaded.", "success");
      return queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
  });

  if (isPending)
    return (
      <ul aria-label="Loading tracks" aria-busy="true" className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <Skeleton className="h-20" />
          </li>
        ))}
      </ul>
    );
  if (error) return <p className="text-danger">Could not load tracks: {error.message}</p>;
  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border p-10 text-center">
        <Flag aria-hidden className="mb-3 size-8 text-muted" />
        <p className="font-medium">No tracks yet</p>
        <p className="mt-1 max-w-md text-sm text-muted">
          Use Import with AI above to add a track from a map image, load the sample tracks
          (Interlagos and Suzuka) to explore the app, or restore a backup.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={() => loadSamples.mutate()} disabled={loadSamples.isPending}>
            <Download aria-hidden className="size-4" />
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

  const visible = filterTracks(tracks, query);
  return (
    <div className="flex flex-col gap-4">
      {tracks.length >= SEARCH_FROM && (
        <div className="relative max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            aria-label="Search tracks"
            placeholder="Search by name, alias or place"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}
      {visible.length === 0 ? (
        <p className="text-sm text-muted">No tracks match “{query.trim()}”.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((track) => (
            <li key={track.id}>
              <Link
                href={`/tracks/view/?track=${track.id}`}
                className="focus-ring group flex min-h-20 items-center gap-4 rounded-xl border border-border bg-background p-4 transition-colors hover:border-foreground/20 hover:bg-surface"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {track.aliases[0] ?? track.name}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {[track.aliases.length > 0 ? track.name : null, track.city, track.country]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
