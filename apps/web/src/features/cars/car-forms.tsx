"use client";

import {
  Downforce,
  Drivetrain,
  SIMS,
  Transmission,
  type Car,
  type CarClass,
  type SimId,
} from "@track-day/schema";
import { useId, useState } from "react";
import type { NewEntity } from "@/data/repositories";
import { Field } from "@/features/tracks/layout-fields";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { useSaveCar, useSaveCarClass } from "./use-garage";

const nice = (v: string) => (v.length <= 3 ? v : v.charAt(0).toUpperCase() + v.slice(1));

function Choice({
  id,
  label,
  value,
  options,
  onChange,
  none = "Not set",
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange(value: string): void;
  none?: string;
}) {
  return (
    <Field id={id} label={label}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{none}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

const enumOptions = (values: readonly string[]) =>
  values.map((v) => ({ value: v, label: nice(v) }));

function FormButtons({
  pending,
  saveLabel,
  onCancel,
}: {
  pending: boolean;
  saveLabel: string;
  onCancel(): void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {saveLabel}
      </Button>
    </div>
  );
}

/** Adds (no `carClass`) or edits a car class. */
export function CarClassForm({
  carClass,
  classes,
  onDone,
}: {
  carClass: CarClass | null;
  classes: CarClass[];
  onDone(): void;
}) {
  const id = useId();
  const [draft, setDraft] = useState({
    name: carClass?.name ?? "",
    description: carClass?.description ?? "",
    drivetrain: carClass?.drivetrain ?? "",
    downforce: carClass?.downforce ?? "",
  });
  const [error, setError] = useState<string | undefined>();
  const save = useSaveCarClass();

  function submit() {
    if (save.isPending) return;
    const name = draft.name.trim();
    const taken = classes.some(
      (c) => c.id !== carClass?.id && c.name.trim().toLowerCase() === name.toLowerCase(),
    );
    const problem = !name
      ? "Give the class a name."
      : taken
        ? `${name} already exists.`
        : undefined;
    setError(problem);
    if (problem) return;
    const value: NewEntity<CarClass> = {
      name,
      description: draft.description.trim(),
      drivetrain: (draft.drivetrain || null) as CarClass["drivetrain"],
      downforce: (draft.downforce || null) as CarClass["downforce"],
    };
    save.mutate({ id: carClass?.id ?? null, value }, { onSuccess: onDone });
  }

  return (
    <form
      aria-label={carClass ? `Edit ${carClass.name}` : "New class"}
      noValidate
      className="space-y-3 rounded-xl border border-border bg-background p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-name`} label="Class name" error={error}>
          <Input
            id={`${id}-name`}
            value={draft.name}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-name-error` : undefined}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Choice
          id={`${id}-drivetrain`}
          label="Drivetrain"
          value={draft.drivetrain}
          options={enumOptions(Drivetrain.options)}
          onChange={(v) => setDraft({ ...draft, drivetrain: v })}
          none="Varies"
        />
        <Choice
          id={`${id}-downforce`}
          label="Downforce"
          value={draft.downforce}
          options={enumOptions(Downforce.options)}
          onChange={(v) => setDraft({ ...draft, downforce: v })}
          none="Varies"
        />
      </div>
      <Field id={`${id}-description`} label="Description">
        <Textarea
          id={`${id}-description`}
          value={draft.description}
          className="h-16"
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </Field>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <FormButtons
        pending={save.isPending}
        saveLabel={carClass ? "Save class" : "Add class"}
        onCancel={onDone}
      />
    </form>
  );
}

const TRISTATE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const fromBool = (b: boolean | null) => (b === null ? "" : b ? "yes" : "no");
const toBool = (s: string) => (s === "" ? null : s === "yes");

/** Adds (no `car`) or edits a car. */
export function CarForm({
  car,
  classes,
  defaultClassId,
  onDone,
}: {
  car: Car | null;
  classes: CarClass[];
  defaultClassId?: string;
  onDone(): void;
}) {
  const id = useId();
  const [draft, setDraft] = useState({
    name: car?.name ?? "",
    classId: car?.classId ?? defaultClassId ?? classes[0]?.id ?? "",
    sim: car?.sim ?? "",
    powerHp: car?.powerHp == null ? "" : String(car.powerHp),
    weightKg: car?.weightKg == null ? "" : String(car.weightKg),
    drivetrain: car?.drivetrain ?? "",
    downforce: car?.downforce ?? "",
    transmission: car?.transmission ?? "",
    abs: fromBool(car?.abs ?? null),
    tc: fromBool(car?.tc ?? null),
  });
  const [errors, setErrors] = useState<Partial<Record<"name" | "powerHp" | "weightKg", string>>>(
    {},
  );
  const save = useSaveCar();
  const set = (key: keyof typeof draft) => (v: string) => setDraft({ ...draft, [key]: v });

  function positive(text: string) {
    if (text.trim() === "") return null;
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function submit() {
    if (save.isPending) return;
    const name = draft.name.trim();
    const powerHp = positive(draft.powerHp);
    const weightKg = positive(draft.weightKg);
    const next = {
      name: name ? undefined : "Give the car a name.",
      powerHp: powerHp === undefined ? "Enter a positive number." : undefined,
      weightKg: weightKg === undefined ? "Enter a positive number." : undefined,
    };
    setErrors(next);
    if (next.name || next.powerHp || next.weightKg) return;
    const value: NewEntity<Car> = {
      name,
      classId: draft.classId,
      sim: (draft.sim || null) as SimId | null,
      powerHp: powerHp ?? null,
      weightKg: weightKg ?? null,
      drivetrain: (draft.drivetrain || null) as Car["drivetrain"],
      downforce: (draft.downforce || null) as Car["downforce"],
      transmission: (draft.transmission || null) as Car["transmission"],
      abs: toBool(draft.abs),
      tc: toBool(draft.tc),
    };
    save.mutate({ id: car?.id ?? null, value }, { onSuccess: onDone });
  }

  const number = (key: "powerHp" | "weightKg", label: string) => (
    <Field id={`${id}-${key}`} label={label} error={errors[key]}>
      <Input
        id={`${id}-${key}`}
        inputMode="numeric"
        value={draft[key]}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        onChange={(e) => set(key)(e.target.value)}
      />
    </Field>
  );

  return (
    <form
      aria-label={car ? `Edit ${car.name}` : "New car"}
      noValidate
      className="space-y-3 rounded-xl border border-border bg-background p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-name`} label="Car name" error={errors.name}>
          <Input
            id={`${id}-name`}
            value={draft.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
            onChange={(e) => set("name")(e.target.value)}
          />
        </Field>
        <Field id={`${id}-class`} label="Class">
          <Select
            id={`${id}-class`}
            value={draft.classId}
            onChange={(e) => set("classId")(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Choice
          id={`${id}-sim`}
          label="Sim"
          value={draft.sim}
          options={SIMS.map((s) => ({ value: s.id, label: s.label }))}
          onChange={set("sim")}
          none="Any sim"
        />
        {number("powerHp", "Power (hp)")}
        {number("weightKg", "Weight (kg)")}
        <Choice
          id={`${id}-drivetrain`}
          label="Drivetrain"
          value={draft.drivetrain}
          options={enumOptions(Drivetrain.options)}
          onChange={set("drivetrain")}
        />
        <Choice
          id={`${id}-downforce`}
          label="Downforce"
          value={draft.downforce}
          options={enumOptions(Downforce.options)}
          onChange={set("downforce")}
        />
        <Choice
          id={`${id}-transmission`}
          label="Transmission"
          value={draft.transmission}
          options={enumOptions(Transmission.options)}
          onChange={set("transmission")}
        />
        <Choice
          id={`${id}-abs`}
          label="ABS"
          value={draft.abs}
          options={TRISTATE}
          onChange={set("abs")}
        />
        <Choice
          id={`${id}-tc`}
          label="Traction control"
          value={draft.tc}
          options={TRISTATE}
          onChange={set("tc")}
        />
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <FormButtons
        pending={save.isPending}
        saveLabel={car ? "Save car" : "Add car"}
        onCancel={onDone}
      />
    </form>
  );
}
