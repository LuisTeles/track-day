import type { Corner, CornerComplex } from "@track-day/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";

const label = (value: string | null) => (value ? value.replace(/-/g, " ") : "—");

export function cornerTitle(corner: Pick<Corner, "number" | "name">) {
  return corner.name ? `T${corner.number} · ${corner.name}` : `Turn ${corner.number}`;
}

interface CornerDetailsProps {
  corner: Corner;
  complexes: CornerComplex[];
  allCorners: Corner[];
  onSelect(cornerId: string): void;
  /** Car-specific guidance for this corner (filled in by the guide layer). */
  guide?: ReactNode;
  /** Buttons or links shown above the details, e.g. "Practice from here". */
  actions?: ReactNode;
  /** Hide the read-only notes and mistakes (edit mode shows forms instead). */
  hideNotes?: boolean;
}

export function CornerDetails({
  corner,
  complexes,
  allCorners,
  onSelect,
  guide,
  actions,
  hideNotes = false,
}: CornerDetailsProps) {
  const memberOf = complexes.filter((c) => c.cornerIds.includes(corner.id));
  const index = allCorners.findIndex((c) => c.id === corner.id);
  const prev = allCorners[(index - 1 + allCorners.length) % allCorners.length];
  const next = allCorners[(index + 1) % allCorners.length];

  return (
    <div className="space-y-5 text-sm">
      {actions}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact term="Direction" value={label(corner.direction)} capitalize />
        <Fact term="Type" value={label(corner.type)} capitalize />
        <Fact term="Elevation" value={label(corner.elevation)} capitalize />
        <Fact term="Camber" value={label(corner.camber)} capitalize />
        {corner.distanceFromStartMeters != null && (
          <Fact term="From start" value={`${corner.distanceFromStartMeters} m`} />
        )}
      </dl>

      {guide}

      {memberOf.map((complex) => (
        <section key={complex.id} className="space-y-2 rounded-lg bg-surface p-3">
          <h3 className="text-sm font-semibold">Part of {complex.name}</h3>
          <p className="text-muted">
            {complex.cornerIds
              .map((id) => allCorners.find((c) => c.id === id))
              .filter(Boolean)
              .map((c) => `T${c!.number}`)
              .join(" + ")}
          </p>
          {complex.notes && <p>{complex.notes}</p>}
        </section>
      ))}

      {!hideNotes && corner.notes && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="whitespace-pre-line">{corner.notes}</p>
        </section>
      )}

      {!hideNotes && corner.commonMistakes.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Common mistakes</h3>
          <ul className="list-disc space-y-1 pl-5">
            {corner.commonMistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {allCorners.length > 1 && prev && next && (
        <nav aria-label="Other corners" className="flex gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            className="flex-1"
            aria-label={`Previous corner, T${prev.number}`}
            onClick={() => onSelect(prev.id)}
          >
            <ChevronLeft aria-hidden />T{prev.number}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            aria-label={`Next corner, T${next.number}`}
            onClick={() => onSelect(next.id)}
          >
            T{next.number}
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );
}

function Fact({ term, value, capitalize }: { term: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{term}</dt>
      <dd className={`mt-0.5 font-medium${capitalize ? " capitalize" : ""}`}>{value}</dd>
    </div>
  );
}

export function CornerList({
  corners,
  onSelect,
}: {
  corners: Corner[];
  onSelect(id: string): void;
}) {
  if (corners.length === 0)
    return <p className="text-sm text-muted">This layout has no corners yet.</p>;
  return (
    <ol className="-mx-2 text-sm">
      {corners.map((corner) => (
        <li key={corner.id}>
          <button
            type="button"
            onClick={() => onSelect(corner.id)}
            className="flex w-full items-center gap-3 h-11 rounded-lg px-2 text-left hover:bg-surface focus-ring"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-marker text-xs font-semibold text-marker-foreground tabular-nums">
              {corner.number}
            </span>
            <span className="flex-1">
              {corner.name ?? <span className="text-muted">Unnamed</span>}
            </span>
            <span className="text-xs text-muted capitalize">{corner.direction}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
