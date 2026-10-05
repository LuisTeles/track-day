import { TrackList } from "@/features/tracks/track-list";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tracks</h1>
      <TrackList />
    </section>
  );
}
