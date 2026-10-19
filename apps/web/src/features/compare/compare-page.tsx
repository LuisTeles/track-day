"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId } from "react";
import { guideLabel } from "@/features/track-view/guides";
import { cornerTitle } from "@/features/track-view/corner-details";
import { useCornerGuides, useTrackView } from "@/features/track-view/use-track-view";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { compareRows } from "./compare-rows";

/** `?track=&layout=&a=<guide>&b=<guide>&corner=<id>`: two cars side by side, corner by corner. */
export function ComparePage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const trackId = params.get("track") ?? "";
  const { data, isPending, error } = useTrackView(trackId, params.get("layout"));
  const guides = data?.guides ?? [];
  const a = guides.find((g) => g.id === params.get("a")) ?? guides[0] ?? null;
  const b =
    guides.find((g) => g.id === params.get("b") && g.id !== a?.id) ??
    guides.find((g) => g.id !== a?.id) ??
    null;
  const { data: aGuides } = useCornerGuides(a?.id ?? null);
  const { data: bGuides } = useCornerGuides(b?.id ?? null);
  const focus = params.get("corner");
  const loaded = aGuides !== undefined && bGuides !== undefined;

  useEffect(() => {
    if (!focus || !loaded) return;
    document.getElementById(`corner-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, loaded]);

  if (!trackId) return <p className="text-muted">No track selected.</p>;
  if (isPending) return <p className="text-muted">Loading…</p>;
  if (error) return <p className="text-danger">Could not load the track: {error.message}</p>;
  if (!data || !data.layout) return <p className="text-muted">This track doesn’t exist.</p>;

  const { track, layout, corners } = data;
  const label = (g: (typeof guides)[number]) =>
    guideLabel(g, data.carClasses ?? [], data.cars ?? []);
  const back = `/tracks/view/?${new URLSearchParams({ track: track.id, layout: layout.id })}`;
  const choose = (key: "a" | "b", value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  if (guides.length < 2 || !a || !b) {
    return (
      <div className="space-y-2">
        <p>Comparing needs two cars with a guide on this layout.</p>
        <Link href={back} className="text-sm underline">
          Back to {track.aliases[0] ?? track.name}
        </Link>
      </div>
    );
  }

  const picker = (key: "a" | "b", value: string, other: string, text: string) => (
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor={`${id}-${key}`}>{text}</Label>
      <Select id={`${id}-${key}`} value={value} onChange={(e) => choose(key, e.target.value)}>
        {guides
          .filter((g) => g.id !== other)
          .map((g) => (
            <option key={g.id} value={g.id}>
              {label(g)}
            </option>
          ))}
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href={back} className="underline">
          {track.aliases[0] ?? track.name} · {layout.name}
        </Link>
      </p>
      <div className="flex flex-wrap gap-3">
        {picker("a", a.id, b.id, "First car")}
        {picker("b", b.id, a.id, "Second car")}
      </div>
      {!loaded ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <ol className="space-y-3">
          {corners.map((corner) => {
            const rows = compareRows(
              aGuides.find((g) => g.cornerId === corner.id),
              bGuides.find((g) => g.cornerId === corner.id),
            );
            return (
              <li
                key={corner.id}
                id={`corner-${corner.id}`}
                className={`scroll-mt-20 rounded-xl border p-3 ${corner.id === focus ? "border-accent ring-2 ring-accent/40" : "border-border"}`}
              >
                <table className="w-full table-fixed text-sm">
                  <caption className="pb-2 text-left font-semibold">{cornerTitle(corner)}</caption>
                  <thead className="text-xs text-muted">
                    <tr>
                      <th scope="col" className="w-24 text-left font-medium">
                        <span className="sr-only">Value</span>
                      </th>
                      <th scope="col" className="text-left font-medium break-words">
                        {label(a)}
                      </th>
                      <th scope="col" className="text-left font-medium break-words">
                        {label(b)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="pt-1 text-muted">
                          Neither car has values for this corner.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.term} className="align-top">
                          <th scope="row" className="py-1 pr-2 text-left font-normal text-muted">
                            {r.term}
                            {r.differs && <span className="sr-only"> (differs)</span>}
                          </th>
                          <td
                            className={`py-1 pr-2 break-words whitespace-pre-line tabular-nums ${r.differs ? "font-semibold" : ""}`}
                          >
                            {r.a}
                          </td>
                          <td
                            className={`py-1 break-words whitespace-pre-line tabular-nums ${r.differs ? "font-semibold" : ""}`}
                          >
                            {r.b}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
