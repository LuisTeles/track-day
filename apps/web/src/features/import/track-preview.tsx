import { simLabel, type TrackImportPayload } from "@track-day/schema";

const normalize = (name: string) => name.trim().toLocaleLowerCase();

export function TrackPreview({
  payload,
  existingNames,
}: {
  payload: TrackImportPayload;
  existingNames: string[];
}) {
  const { track, layout, corners } = payload;
  const complexes = payload.complexes ?? [];
  const segments = payload.segments ?? [];
  const duplicate = existingNames.some((n) => normalize(n) === normalize(track.name));
  const details = [track.aliases?.join(", "), track.city, track.country].filter(Boolean);

  return (
    <div className="space-y-5 text-sm">
      <p className="inline-block rounded-md border border-border px-2 py-0.5 text-xs text-muted">
        From AI — estimates until confirmed
      </p>
      {duplicate && (
        <p className="rounded-md border border-border bg-surface p-3">
          You already have a track named “{track.name}”. Saving creates a separate track.
        </p>
      )}

      <div>
        <p className="text-base font-medium">{track.name}</p>
        {details.length > 0 && <p className="text-muted">{details.join(" · ")}</p>}
        {track.sims && track.sims.length > 0 && (
          <p className="text-muted">In {track.sims.map((s) => simLabel(s.sim)).join(", ")}</p>
        )}
        <p className="mt-1">
          Layout {layout.name} · {layout.lengthMeters} m · {layout.direction}
        </p>
      </div>

      <div>
        <h3 className="mb-1 font-medium">{corners.length} corners</h3>
        <ol aria-label="Corners" className="divide-y divide-border rounded-lg border border-border">
          {corners.map((c) => (
            <li key={c.number} className="flex items-center gap-3 px-3 py-1.5">
              <span className="w-8 shrink-0 font-semibold tabular-nums">T{c.number}</span>
              <span className="flex-1">{c.name ?? <span className="text-muted">—</span>}</span>
              <span className="text-muted capitalize">
                {[c.direction, c.type].filter(Boolean).join(" · ")}
              </span>
              <span className="w-16 text-right text-muted tabular-nums">
                {c.distanceFromStartMeters != null ? `${c.distanceFromStartMeters} m` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {complexes.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Complexes</h3>
          <ul className="space-y-0.5">
            {complexes.map((c) => (
              <li key={c.name}>
                {c.name} <span className="text-muted">· T{c.cornerNumbers.join(", T")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {segments.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Segments</h3>
          <ul className="space-y-0.5">
            {segments.map((s) => (
              <li key={s.name}>
                {s.name}
                {(s.fromCorner != null || s.toCorner != null) && (
                  <span className="text-muted">
                    {" "}
                    · T{s.fromCorner ?? "?"} → T{s.toCorner ?? "?"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
