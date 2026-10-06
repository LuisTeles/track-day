import type { Metadata } from "next";
import { TrackImportPage } from "@/features/import/track-import-page";

export const metadata: Metadata = { title: "Import track · Track Day" };

export default function ImportPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import a track with AI</h1>
        <p className="text-sm text-muted">
          No API key needed: copy a prompt, ask any AI chat with a track map, paste the answer back.
        </p>
      </div>
      <TrackImportPage />
    </section>
  );
}
