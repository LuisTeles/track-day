import { isEstimate } from "@/features/guides/estimate";
import type { CornerGuide } from "@track-day/schema";

/** Car-specific guidance for one corner, shown in the corner details. */
export function CornerGuideSection({
  guide,
  label,
}: {
  guide: CornerGuide | undefined;
  label: string;
}) {
  if (!guide) {
    return (
      <section className="rounded-lg border border-dashed border-border p-3 text-muted">
        No guidance for this corner in “{label}”.
      </section>
    );
  }

  const speed = (v: number | null) => (v == null ? "—" : `${Math.round(v)} km/h`);
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{label}</h3>
        {isEstimate(guide) && (
          <span className="rounded-full border border-estimate/50 bg-estimate/10 px-2.5 py-1 text-xs font-medium text-estimate">
            {guide.source === "ai" ? "AI estimate" : "Estimate"}
            {guide.confidence ? ` · ${guide.confidence} confidence` : ""}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
        <Value term="Entry" value={speed(guide.entrySpeedKmh)} />
        <Value term="Minimum" value={speed(guide.minSpeedKmh)} />
        <Value term="Exit" value={speed(guide.exitSpeedKmh)} />
        <Value term="Gear" value={guide.gear == null ? "—" : String(guide.gear)} />
        <Value
          term="Brake"
          value={
            guide.brakeReference ??
            (guide.brakeMarkerMeters != null ? `${guide.brakeMarkerMeters} m board` : "—")
          }
          wide
        />
        {guide.priority && <Value term="Priority" value={`${guide.priority}`} wide />}
      </dl>
      {(guide.line.turnIn || guide.line.apex || guide.line.exit) && (
        <dl className="space-y-1">
          {guide.line.turnIn && <Value term="Turn-in" value={guide.line.turnIn} />}
          {guide.line.apex && <Value term="Apex" value={guide.line.apex} />}
          {guide.line.exit && <Value term="Exit line" value={guide.line.exit} />}
        </dl>
      )}
      {guide.throttleNotes && <p>{guide.throttleNotes}</p>}
      {guide.trailBrakeNotes && <p>{guide.trailBrakeNotes}</p>}
      {guide.notes.trim() && <p className="whitespace-pre-line">{guide.notes}</p>}
    </section>
  );
}

function Value({ term, value, wide }: { term: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-muted">{term}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
