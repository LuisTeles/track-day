"use client";

import type { Corner, CornerComplex, Segment } from "@track-day/schema";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Field } from "@/features/tracks/layout-fields";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { FormFooter, submitOnModEnter } from "../edit/form-footer";
import { useDeleteSection, useSaveSection } from "../edit/use-structure-mutations";

/** Which item's form is open: an existing id, a new one of a kind, or none. */
type Open = { kind: "complexes" | "segments"; id: string | null } | null;

/** Complexes and segments of a layout (`panel=sections`): read-only, or editable in edit mode. */
export function SectionsPanel({
  layoutId,
  corners,
  complexes,
  segments,
  editing,
  onDirtyChange,
}: {
  layoutId: string;
  corners: Corner[];
  complexes: CornerComplex[];
  segments: Segment[];
  editing: boolean;
  onDirtyChange(dirty: boolean): void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const number = (id: string | null) => corners.find((c) => c.id === id)?.number;
  const turns = (ids: string[]) =>
    ids
      .map(number)
      .filter((n) => n !== undefined)
      .map((n) => `T${n}`)
      .join(" + ");
  const span = (s: Segment) => {
    const from = number(s.fromCornerId);
    const to = number(s.toCornerId);
    return `${from ? `T${from}` : "Start"} → ${to ? `T${to}` : "End"}`;
  };
  const isOpen = (kind: "complexes" | "segments", id: string | null) =>
    editing && open?.kind === kind && open.id === id;
  const close = () => setOpen(null);

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-2">
        <h3 className="font-medium">Complexes</h3>
        <p className="text-muted">Corners driven as one, like an S or a chicane.</p>
        {complexes.length === 0 && !isOpen("complexes", null) && (
          <p className="text-muted">No complexes yet.</p>
        )}
        <ul className="space-y-2">
          {complexes.map((c) =>
            isOpen("complexes", c.id) ? (
              <li key={c.id}>
                <ComplexForm
                  layoutId={layoutId}
                  complex={c}
                  corners={corners}
                  onDone={close}
                  onDirtyChange={onDirtyChange}
                />
              </li>
            ) : (
              <Item
                key={c.id}
                name={c.name}
                detail={turns(c.cornerIds)}
                notes={c.notes}
                onEdit={
                  editing && open === null ? () => setOpen({ kind: "complexes", id: c.id }) : null
                }
              />
            ),
          )}
        </ul>
        {isOpen("complexes", null) ? (
          <ComplexForm
            layoutId={layoutId}
            complex={null}
            corners={corners}
            onDone={close}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          editing && (
            <Button
              variant="outline"
              disabled={open !== null || corners.length < 2}
              onClick={() => setOpen({ kind: "complexes", id: null })}
            >
              <Plus aria-hidden />
              Add complex
            </Button>
          )
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Segments</h3>
        <p className="text-muted">Straights and sections between corners.</p>
        {segments.length === 0 && !isOpen("segments", null) && (
          <p className="text-muted">No segments yet.</p>
        )}
        <ul className="space-y-2">
          {segments.map((s) =>
            isOpen("segments", s.id) ? (
              <li key={s.id}>
                <SegmentForm
                  layoutId={layoutId}
                  segment={s}
                  corners={corners}
                  onDone={close}
                  onDirtyChange={onDirtyChange}
                />
              </li>
            ) : (
              <Item
                key={s.id}
                name={s.name}
                detail={span(s)}
                notes={s.notes}
                onEdit={
                  editing && open === null ? () => setOpen({ kind: "segments", id: s.id }) : null
                }
              />
            ),
          )}
        </ul>
        {isOpen("segments", null) ? (
          <SegmentForm
            layoutId={layoutId}
            segment={null}
            corners={corners}
            onDone={close}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          editing && (
            <Button
              variant="outline"
              disabled={open !== null}
              onClick={() => setOpen({ kind: "segments", id: null })}
            >
              <Plus aria-hidden />
              Add segment
            </Button>
          )
        )}
      </section>
      {!editing && <p className="text-muted">Turn on Edit to add or change them.</p>}
    </div>
  );
}

function Item({
  name,
  detail,
  notes,
  onEdit,
}: {
  name: string;
  detail: string;
  notes: string;
  onEdit: (() => void) | null;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg bg-surface p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium break-words">{name}</p>
        <p className="text-muted">{detail}</p>
        {notes && <p className="whitespace-pre-line">{notes}</p>}
      </div>
      {onEdit && (
        <Button variant="ghost" size="icon" aria-label={`Edit ${name}`} onClick={onEdit}>
          <Pencil aria-hidden />
        </Button>
      )}
    </li>
  );
}

/** Dirty tracking and delete shared by the two forms. */
function useSectionForm<T>(initial: T, draft: T, onDirtyChange: (dirty: boolean) => void) {
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  return dirty;
}

function ComplexForm({
  layoutId,
  complex,
  corners,
  onDone,
  onDirtyChange,
}: {
  layoutId: string;
  complex: CornerComplex | null;
  corners: Corner[];
  onDone(): void;
  onDirtyChange(dirty: boolean): void;
}) {
  const initial = {
    name: complex?.name ?? "",
    cornerIds: complex?.cornerIds ?? [],
    notes: complex?.notes ?? "",
  };
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<{ name?: string; corners?: string }>({});
  const save = useSaveSection("complexes");
  const dirty = useSectionForm(initial, draft, onDirtyChange);
  const id = useId();

  function submit() {
    if (save.isPending) return;
    const name = draft.name.trim();
    // Kept in lap order, whatever order they were ticked in.
    const cornerIds = corners.filter((c) => draft.cornerIds.includes(c.id)).map((c) => c.id);
    const next = {
      name: name ? undefined : "Give the complex a name.",
      corners: cornerIds.length >= 2 ? undefined : "Pick at least two corners.",
    };
    setErrors(next);
    if (next.name || next.corners) return;
    save.mutate(
      { id: complex?.id ?? null, value: { layoutId, name, cornerIds, notes: draft.notes } },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label={complex ? `Edit ${complex.name}` : "New complex"}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={submitOnModEnter(submit)}
    >
      <Field id={`${id}-name`} label="Name" error={errors.name}>
        <Input
          id={`${id}-name`}
          value={draft.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </Field>
      <fieldset
        className="space-y-1"
        aria-describedby={errors.corners ? `${id}-corners-error` : undefined}
      >
        <legend className="font-medium">Corners</legend>
        <div className="grid grid-cols-3 gap-x-2">
          {corners.map((c) => (
            <label key={c.id} className="flex min-h-9 items-center gap-2 pointer-coarse:min-h-11">
              <input
                type="checkbox"
                checked={draft.cornerIds.includes(c.id)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cornerIds: e.target.checked
                      ? [...draft.cornerIds, c.id]
                      : draft.cornerIds.filter((x) => x !== c.id),
                  })
                }
              />
              T{c.number}
            </label>
          ))}
        </div>
        {errors.corners && (
          <p id={`${id}-corners-error`} className="text-xs text-danger">
            {errors.corners}
          </p>
        )}
      </fieldset>
      <Field id={`${id}-notes`} label="Notes">
        <Textarea
          id={`${id}-notes`}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="h-20"
        />
      </Field>
      {complex && (
        <DeleteButton kind="complexes" id={complex.id} name={complex.name} onDeleted={onDone} />
      )}
      {save.error && (
        <p role="alert" className="text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <FormFooter
        dirty={dirty}
        pending={save.isPending}
        saved={false}
        failed={save.isError}
        saveLabel={complex ? `Save ${complex.name}` : "Save new complex"}
        onCancel={onDone}
      />
    </form>
  );
}

function SegmentForm({
  layoutId,
  segment,
  corners,
  onDone,
  onDirtyChange,
}: {
  layoutId: string;
  segment: Segment | null;
  corners: Corner[];
  onDone(): void;
  onDirtyChange(dirty: boolean): void;
}) {
  const initial = {
    name: segment?.name ?? "",
    fromCornerId: segment?.fromCornerId ?? "",
    toCornerId: segment?.toCornerId ?? "",
    notes: segment?.notes ?? "",
  };
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const save = useSaveSection("segments");
  const dirty = useSectionForm(initial, draft, onDirtyChange);
  const id = useId();

  function submit() {
    if (save.isPending) return;
    const name = draft.name.trim();
    setError(name ? undefined : "Give the segment a name.");
    if (!name) return;
    save.mutate(
      {
        id: segment?.id ?? null,
        value: {
          layoutId,
          name,
          fromCornerId: draft.fromCornerId || null,
          toCornerId: draft.toCornerId || null,
          notes: draft.notes,
        },
      },
      { onSuccess: onDone },
    );
  }

  const cornerSelect = (key: "fromCornerId" | "toCornerId", label: string, none: string) => (
    <Field id={`${id}-${key}`} label={label}>
      <Select
        id={`${id}-${key}`}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      >
        <option value="">{none}</option>
        {corners.map((c) => (
          <option key={c.id} value={c.id}>
            T{c.number}
            {c.name ? ` · ${c.name}` : ""}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label={segment ? `Edit ${segment.name}` : "New segment"}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={submitOnModEnter(submit)}
    >
      <Field id={`${id}-name`} label="Name" error={error}>
        <Input
          id={`${id}-name`}
          value={draft.name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-name-error` : undefined}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {cornerSelect("fromCornerId", "From", "Start of the lap")}
        {cornerSelect("toCornerId", "To", "End of the lap")}
      </div>
      <Field id={`${id}-notes`} label="Notes">
        <Textarea
          id={`${id}-notes`}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="h-20"
        />
      </Field>
      {segment && (
        <DeleteButton kind="segments" id={segment.id} name={segment.name} onDeleted={onDone} />
      )}
      {save.error && (
        <p role="alert" className="text-danger">
          Could not save: {save.error.message}
        </p>
      )}
      <FormFooter
        dirty={dirty}
        pending={save.isPending}
        saved={false}
        failed={save.isError}
        saveLabel={segment ? `Save ${segment.name}` : "Save new segment"}
        onCancel={onDone}
      />
    </form>
  );
}

function DeleteButton({
  kind,
  id,
  name,
  onDeleted,
}: {
  kind: "complexes" | "segments";
  id: string;
  name: string;
  onDeleted(): void;
}) {
  const remove = useDeleteSection(kind);
  const confirm = useConfirm();
  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        className="text-danger"
        disabled={remove.isPending}
        onClick={() =>
          void confirm({
            title: `Delete ${name}?`,
            description: `The corners stay; only this ${kind === "complexes" ? "complex" : "segment"} and its notes go.`,
            confirmLabel: kind === "complexes" ? "Delete complex" : "Delete segment",
            destructive: true,
          }).then((ok) => ok && remove.mutate(id, { onSuccess: onDeleted }))
        }
      >
        <Trash2 aria-hidden />
        {kind === "complexes" ? "Delete complex" : "Delete segment"}
      </Button>
      {remove.error && (
        <p role="alert" className="text-danger">
          Could not delete: {remove.error.message}
        </p>
      )}
    </div>
  );
}
