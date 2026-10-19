import { Info } from "lucide-react";
import { Button } from "@/shared/ui/button";

/** The shown guide is the class's, because the car you drive has none on this layout. */
export function ClassGuideNote({
  carName,
  className,
  onAdd,
}: {
  carName: string;
  className: string;
  /** Edit mode: start a guide for the car itself. */
  onAdd?: () => void;
}) {
  return (
    <section
      aria-label="Class guide"
      className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-3 text-sm"
    >
      <Info aria-hidden className="size-4 shrink-0 text-muted" />
      <p className="min-w-0 flex-1">
        {className} class guide — no {carName} guide on this layout yet.
      </p>
      {onAdd && (
        <Button variant="outline" size="sm" onClick={onAdd}>
          Add a guide for {carName}
        </Button>
      )}
    </section>
  );
}
