import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackViewPage } from "@/features/track-view/track-view-page";

export const metadata: Metadata = { title: "Track · Track Day" };

// Ids come from IndexedDB, so they travel as query params (ADR-003);
// useSearchParams needs a Suspense boundary in a static export.
export default function Page() {
  return (
    <Suspense>
      <TrackViewPage />
    </Suspense>
  );
}
