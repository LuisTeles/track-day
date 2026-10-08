import type { Metadata } from "next";
import { TrackImportPage } from "@/features/import/track-import-page";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "Import track · Track Day" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import a track with AI"
        description="No API key needed: copy a prompt, ask any AI chat with a track map, paste the answer back."
      />
      <TrackImportPage />
    </>
  );
}
