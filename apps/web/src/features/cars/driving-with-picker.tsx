"use client";

import { SIMS, simLabel, type SimId } from "@track-day/schema";
import { Gauge } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Select } from "@/shared/ui/select";
import { useDrivingWith } from "./driving-with";
import { useGarage } from "./use-garage";

/** Header control: the car and sim you're driving, used to pick each track's guide. */
export function DrivingWithPicker() {
  const id = useId();
  const [driving, setDriving] = useDrivingWith();
  const { data } = useGarage();
  const classes = data?.classes ?? [];
  const cars = data?.cars ?? [];
  // A car deleted since it was picked counts as none.
  const car = cars.find((c) => c.id === driving?.carId) ?? null;
  const summary = car
    ? `${car.name}${driving?.sim ? ` · ${simLabel(driving.sim)}` : ""}`
    : "No car";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-48 max-sm:px-2"
          aria-label={`Driving: ${summary}`}
        >
          <Gauge aria-hidden />
          <span className="truncate max-sm:sr-only">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Driving with" className="space-y-3">
        <p className="text-sm text-muted">
          Tracks open with this car’s guide, or its class’s when it has none.
        </p>
        {cars.length === 0 ? (
          <p className="text-sm">
            No cars yet.{" "}
            <Link href="/cars/" className="underline">
              Add one in Cars
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${id}-car`}>Driving</Label>
              <Select
                id={`${id}-car`}
                value={car?.id ?? ""}
                onChange={(e) => {
                  const next = cars.find((c) => c.id === e.target.value);
                  setDriving(next ? { carId: next.id, sim: next.sim } : null);
                }}
              >
                <option value="">No car</option>
                {classes.map((cls) => {
                  const inClass = cars.filter((c) => c.classId === cls.id);
                  return (
                    inClass.length > 0 && (
                      <optgroup key={cls.id} label={cls.name}>
                        {inClass.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    )
                  );
                })}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-sim`}>In</Label>
              <Select
                id={`${id}-sim`}
                value={driving?.sim ?? ""}
                disabled={!car}
                onChange={(e) =>
                  car &&
                  setDriving({ carId: car.id, sim: (e.target.value || null) as SimId | null })
                }
              >
                <option value="">Any sim</option>
                {SIMS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
