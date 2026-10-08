import type { Track } from "@track-day/schema";

/** Show the search box from this many tracks. */
export const SEARCH_FROM = 6;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function filterTracks<T extends Pick<Track, "name" | "aliases" | "city" | "country">>(
  tracks: T[],
  query: string,
): T[] {
  const q = fold(query.trim());
  if (!q) return tracks;
  return tracks.filter((t) =>
    fold([t.name, ...t.aliases, t.city ?? "", t.country ?? ""].join(" ")).includes(q),
  );
}
