import { Sparkles } from "lucide-react";
import Link from "next/link";
import { TrackList } from "@/features/tracks/track-list";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Tracks"
        actions={
          <Button asChild variant="outline">
            <Link href="/tracks/import/">
              <Sparkles />
              Import with AI
            </Link>
          </Button>
        }
      />
      <TrackList />
    </>
  );
}
