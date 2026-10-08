import { cn } from "@/shared/lib/utils";

/** ODbL attribution, required wherever OSM-derived geometry is shown. */
export function OsmAttribution({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted", className)}>
      Map data ©{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        OpenStreetMap contributors
      </a>
    </p>
  );
}
