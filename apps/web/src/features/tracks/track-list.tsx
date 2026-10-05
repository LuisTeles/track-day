"use client";

import { useTracks } from "./use-tracks";

export function TrackList() {
  const { data: tracks, isPending, error } = useTracks();

  if (isPending) return <p className="text-muted">Loading tracks…</p>;
  if (error) return <p className="text-danger">Could not load tracks: {error.message}</p>;
  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-medium">No tracks yet</p>
        <p className="mt-1 text-sm text-muted">
          Track creation and AI-assisted import are coming next. You can restore a backup in the
          meantime.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {tracks.map((track) => (
        <li key={track.id} className="px-4 py-3">
          <p className="font-medium">{track.name}</p>
          {(track.aliases.length > 0 || track.country) && (
            <p className="text-sm text-muted">
              {[track.aliases.join(", "), track.city, track.country].filter(Boolean).join(" · ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
