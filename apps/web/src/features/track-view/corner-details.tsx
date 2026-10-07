import type { Corner, CornerComplex } from "@track-day/schema";
import type { ReactNode } from "react";

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
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
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
        <section key={complex.id} className="rounded-lg bg-surface p-3">
          <h3 className="font-medium">Part of {complex.name}</h3>
          <p className="mt-1 text-muted">
            {complex.cornerIds
              .map((id) => allCorners.find((c) => c.id === id))
              .filter(Boolean)
              .map((c) => `T${c!.number}`)
              .join(" + ")}
          </p>
          {complex.notes && <p className="mt-2">{complex.notes}</p>}
        </section>
      ))}

      {!hideNotes && corner.notes && (
        <section>
          <h3 className="font-medium">Notes</h3>
          <p className="mt-1 whitespace-pre-line">{corner.notes}</p>
        </section>
      )}

      {!hideNotes && corner.commonMistakes.length > 0 && (
        <section>
          <h3 className="font-medium">Common mistakes</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {corner.commonMistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {allCorners.length > 1 && prev && next && (
        <nav
          aria-label="Other corners"
          className="flex justify-between border-t border-border pt-3"
        >
          <button
            type="button"
            className="text-muted hover:text-foreground"
            onClick={() => onSelect(prev.id)}
          >
            ← T{prev.number}
          </button>
          <button
            type="button"
            className="text-muted hover:text-foreground"
            onClick={() => onSelect(next.id)}
          >
            T{next.number} →
          </button>
        </nav>
      )}
    </div>
  );
}

function Fact({ term, value, capitalize }: { term: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{term}</dt>
      <dd className={capitalize ? "capitalize" : undefined}>{value}</dd>
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
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-marker text-xs font-semibold text-marker-foreground tabular-nums">
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
