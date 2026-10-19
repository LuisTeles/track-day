import type { Metadata } from "next";
import { NewTrackForm } from "@/features/tracks/new-track-form";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "New track · Track Day" };

export default function NewTrackPage() {
  return (
    <>
      <PageHeader
        title="New track"
        description="Start from the name and the first layout, then add corners on the next screen."
      />
      <NewTrackForm />
    </>
  );
}
