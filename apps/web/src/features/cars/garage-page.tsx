"use client";

import { simLabel, type Car, type CarClass } from "@track-day/schema";
import { Car as CarIcon, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRepositories } from "@/data/provider";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";
import { Skeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast";
import { CarClassForm, CarForm } from "./car-forms";
import { useAddStarterClasses, useDeleteCar, useDeleteCarClass, useGarage } from "./use-garage";

/** What's open: a class or car form (new or existing), or nothing. */
type Open =
  | { kind: "class"; id: string | null }
  | { kind: "car"; id: string | null; classId?: string }
  | null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Car summary: sim and the specs that are known. */
function carFacts(car: Car) {
  return [
    car.sim ? simLabel(car.sim) : "Any sim",
    car.powerHp && `${car.powerHp} hp`,
    car.weightKg && `${car.weightKg} kg`,
    car.drivetrain,
    car.transmission,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function GaragePage() {
  const { data, isPending, error } = useGarage();
  const [open, setOpen] = useState<Open>(null);
  const starters = useAddStarterClasses();
  const deleteCar = useDeleteCar();
  const deleteClass = useDeleteCarClass();
  const repos = useRepositories();
  const confirm = useConfirm();
  const toast = useToast();
  const close = () => setOpen(null);

  if (isPending)
    return (
      <div aria-label="Loading cars" aria-busy="true" className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  if (error) return <p className="text-danger">Could not load the cars: {error.message}</p>;
  const { classes, cars } = data;

  async function removeCar(car: Car) {
    const guides = await repos.carDeletion.countGuides({ carId: car.id });
    const ok = await confirm({
      title: `Delete ${car.name}?`,
      description:
        guides > 0
          ? `Its ${plural(guides, "guide")} and every value in them go too. Export a backup first if you might want them back.`
          : "It has no guides.",
      confirmLabel: "Delete car",
      destructive: true,
    });
    if (ok)
      deleteCar.mutate(car.id, { onSuccess: () => toast.show(`Deleted ${car.name}.`, "success") });
  }

  async function removeClass(carClass: CarClass) {
    const guides = await repos.carDeletion.countGuides({ carClassId: carClass.id });
    const ok = await confirm({
      title: `Delete ${carClass.name}?`,
      description:
        guides > 0
          ? `Its ${plural(guides, "class guide")} go too. Export a backup first if you might want them back.`
          : "It has no class guides.",
      confirmLabel: "Delete class",
      destructive: true,
    });
    if (ok)
      deleteClass.mutate(carClass.id, {
        onSuccess: () => toast.show(`Deleted ${carClass.name}.`, "success"),
      });
  }

  const busy = open !== null;
  const failure = starters.error ?? deleteCar.error ?? deleteClass.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setOpen({ kind: "class", id: null })}
        >
          <Plus aria-hidden />
          Add class
        </Button>
        <Button
          variant="outline"
          disabled={busy || classes.length === 0}
          title={classes.length === 0 ? "Add a class first" : undefined}
          onClick={() => setOpen({ kind: "car", id: null })}
        >
          <Plus aria-hidden />
          Add car
        </Button>
        {classes.length > 0 && (
          <Button variant="ghost" disabled={starters.isPending} onClick={() => starters.mutate()}>
            <Download aria-hidden />
            Add starter classes
          </Button>
        )}
      </div>
      {failure && (
        <p role="alert" className="text-sm text-danger">
          {failure.message}
        </p>
      )}

      {open?.kind === "class" && open.id === null && (
        <CarClassForm carClass={null} classes={classes} onDone={close} />
      )}
      {open?.kind === "car" && open.id === null && (
        <CarForm car={null} classes={classes} defaultClassId={open.classId} onDone={close} />
      )}

      {classes.length === 0 && open === null && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border p-10 text-center">
          <CarIcon aria-hidden className="mb-3 size-8 text-muted" />
          <p className="font-medium">No cars yet</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Cars belong to a class, and a class guide covers every car in it. Start from the usual
            classes (Formula, GT3, GT4, Road car, Drift), or add your own.
          </p>
          <Button className="mt-4" onClick={() => starters.mutate()} disabled={starters.isPending}>
            <Download aria-hidden />
            {starters.isPending ? "Adding…" : "Add starter classes"}
          </Button>
        </div>
      )}

      {classes.map((carClass) => {
        const inClass = cars.filter((c) => c.classId === carClass.id);
        return (
          <section
            key={carClass.id}
            aria-labelledby={`class-${carClass.id}`}
            className="space-y-3 rounded-2xl border border-border p-4"
          >
            {open?.kind === "class" && open.id === carClass.id ? (
              <CarClassForm carClass={carClass} classes={classes} onDone={close} />
            ) : (
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 id={`class-${carClass.id}`} className="font-semibold">
                    {carClass.name}
                  </h2>
                  <p className="text-sm text-muted">
                    {[
                      carClass.description,
                      carClass.drivetrain,
                      carClass.downforce && `${carClass.downforce} downforce`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No description"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${carClass.name}`}
                  disabled={busy}
                  onClick={() => setOpen({ kind: "class", id: carClass.id })}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${carClass.name}`}
                  title={inClass.length > 0 ? "Move or delete its cars first" : undefined}
                  disabled={busy || inClass.length > 0}
                  onClick={() => void removeClass(carClass)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            )}
            {inClass.length === 0 ? (
              <p className="text-sm text-muted">No cars in this class.</p>
            ) : (
              <ul className="divide-y divide-border">
                {inClass.map((car) =>
                  open?.kind === "car" && open.id === car.id ? (
                    <li key={car.id} className="py-2">
                      <CarForm car={car} classes={classes} onDone={close} />
                    </li>
                  ) : (
                    <li key={car.id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{car.name}</p>
                        <p className="truncate text-sm text-muted">{carFacts(car)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${car.name}`}
                        disabled={busy}
                        onClick={() => setOpen({ kind: "car", id: car.id })}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${car.name}`}
                        disabled={busy}
                        onClick={() => void removeCar(car)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ),
                )}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setOpen({ kind: "car", id: null, classId: carClass.id })}
            >
              <Plus aria-hidden />
              Add {carClass.name} car
            </Button>
          </section>
        );
      })}
    </div>
  );
}
