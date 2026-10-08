"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { usePracticeSession } from "@/features/practice/use-practice-session";
import { Button } from "@/shared/ui/button";
import { OsmAttribution } from "@/shared/ui/osm-attribution";
import { PrintMap } from "./print-map";
import { cheatSheetRows } from "./rows";

const COLUMNS = ["Turn", "Corner", "Dir", "Gear", "Brake at", "Min speed", "Cue"];

/** `?track=&layout=&guide=`: one printable page of corners and the car's numbers. */
export function CheatSheetPage() {
  const params = useSearchParams();
  const trackId = params.get("track");
  if (!trackId) return <Message>No track selected.</Message>;
  return <Sheet trackId={trackId} layoutId={params.get("layout")} guideId={params.get("guide")} />;
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <p>{children}</p>
      <Link href="/" className="text-sm underline">
        Back to tracks
      </Link>
    </main>
  );
}

function Sheet({
  trackId,
  layoutId,
  guideId,
}: {
  trackId: string;
  layoutId: string | null;
  guideId: string | null;
}) {
  const session = usePracticeSession(trackId, layoutId, guideId);
  const { data, guide, guideLabel, guideFor } = session;
  const corners = useMemo(
    () => [...(data?.corners ?? [])].sort((a, b) => a.order - b.order || a.number - b.number),
    [data?.corners],
  );
  const rows = cheatSheetRows(corners, guideFor);

  if (session.isPending) return <Message>Loading…</Message>;
  if (session.error || !data?.layout) return <Message>This track could not be found.</Message>;

  const { track, layout } = data;
  const title = track.aliases[0] ?? track.name;
  const query = new URLSearchParams({ track: track.id, layout: layout.id });
  if (guide) query.set("guide", guide.id);
  const mapLabel = `Map of ${title}, ${layout.name}`;

  return (
    <div className="min-h-dvh bg-surface print:bg-transparent">
      <div className="mx-auto print:hidden flex max-w-3xl items-center justify-between gap-2 p-3">
        <Button asChild variant="ghost">
          <Link href={`/tracks/view/?${query}`}>
            <ArrowLeft aria-hidden />
            Back to track
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer aria-hidden />
          Print
        </Button>
      </div>
      {/* Always light: color-scheme resolves the light-dark() tokens to light. */}
      <article
        data-testid="cheat-sheet"
        className="scheme-light mx-auto max-w-3xl bg-background p-5 text-foreground shadow-sm print:max-w-none print:p-0 print:shadow-none"
      >
        <header className="mb-3">
          <h1 className="text-xl font-semibold">
            {title} · {layout.name}
          </h1>
          <p className="text-sm text-muted">
            {guideLabel ?? "No car selected"}
            {layout.lengthMeters ? ` · ${(layout.lengthMeters / 1000).toFixed(3)} km` : ""}
          </p>
        </header>
        {layout.outlinePath && (
          <div className="mb-3 [break-inside:avoid]">
            <PrintMap
              outlinePath={layout.outlinePath}
              layout={layout}
              corners={corners}
              label={mapLabel}
            />
          </div>
        )}
        <table className="w-full border-collapse text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className="px-1.5 py-1 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.number} className="border-b border-border [break-inside:avoid]">
                <td className="px-1.5 py-1 font-semibold">{r.number}</td>
                <td className="px-1.5 py-1">{r.name}</td>
                <td className="px-1.5 py-1">{r.direction}</td>
                <td className="px-1.5 py-1">{r.gear}</td>
                <td className="px-1.5 py-1">{r.brake}</td>
                <td className="px-1.5 py-1">
                  {r.minSpeed}
                  {r.estimate && r.minSpeed !== "—" && <span className="text-muted"> est.</span>}
                </td>
                <td className="px-1.5 py-1">{r.cue}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {guide?.setupNotes.trim() && (
          <section className="mt-4 [break-inside:avoid]">
            <h2 className="text-base font-semibold">Setup notes</h2>
            <p className="text-sm whitespace-pre-line">{guide.setupNotes}</p>
          </section>
        )}
        {layout.outlineSource === "osm" && <OsmAttribution className="mt-3" />}
      </article>
    </div>
  );
}
