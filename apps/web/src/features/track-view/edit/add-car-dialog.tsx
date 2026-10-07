"use client";

import { buildGuidePrompt, readAiError } from "@track-day/prompts";
import {
  GuideImportPayload,
  parseImport,
  SIMS,
  type CarClass,
  type Corner,
  type FieldIssue,
  type Layout,
  type SimId,
  type Track,
} from "@track-day/schema";
import { useId, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { IssueList } from "@/shared/ui/issue-list";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { missingCorners, trackPayloadFor } from "./guide-payload";
import { useAddCar } from "./use-edit-mutations";

export function AddCarDialog({
  open,
  onOpenChange,
  track,
  layout,
  corners,
  carClasses,
  onAdded,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  track: Track;
  layout: Layout;
  corners: Corner[];
  carClasses: CarClass[];
  onAdded(guideId: string): void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [sim, setSim] = useState<SimId | "">("");
  const [className, setClassName] = useState(carClasses[0]?.name ?? "Other");
  const [start, setStart] = useState<"empty" | "ai">("empty");
  const [answer, setAnswer] = useState("");
  const [problem, setProblem] = useState<{ message: string; issues?: FieldIssue[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const add = useAddCar(layout.id);

  const trackPayload = useMemo(
    () => trackPayloadFor(track, layout, corners),
    [track, layout, corners],
  );
  const prompt = useMemo(
    () =>
      trackPayload
        ? buildGuidePrompt({
            track: trackPayload,
            car: {
              name: name || "the car",
              powerHp: null,
              weightKg: null,
              drivetrain: null,
              downforce: null,
              transmission: null,
              abs: null,
              tc: null,
            },
            carClass: { name: className || "Other" },
            sim: sim || null,
          })
        : null,
    [trackPayload, name, className, sim],
  );

  function submit() {
    setProblem(null);
    let guide: GuideImportPayload | null = null;
    if (start === "ai") {
      const reason = readAiError(answer);
      if (reason !== null)
        return setProblem({ message: `The AI couldn’t write the guide: “${reason}”` });
      const result = parseImport(answer, GuideImportPayload);
      if (!result.ok)
        return setProblem({
          message: "The JSON doesn’t match the guide format",
          issues: result.issues,
        });
      const missing = missingCorners(result.value, corners);
      if (missing.length > 0) {
        return setProblem({ message: `This layout has no corner ${missing.join(", ")}.` });
      }
      guide = result.value;
    }
    add.mutate(
      { name, sim: sim || null, className, guide },
      { onSuccess: ({ guideId }) => onAdded(guideId) },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !add.isPending && onOpenChange(next)}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogTitle>Add a car</AlertDialogTitle>
        <AlertDialogDescription>
          Its values and notes are kept per layout. Start empty and fill corners as you learn them,
          or start from an AI estimate.
        </AlertDialogDescription>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-name`}>Car name</Label>
            <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-sim`}>Sim</Label>
              <select
                id={`${id}-sim`}
                value={sim}
                onChange={(e) => setSim(e.target.value as SimId | "")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Any sim</option>
                {SIMS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-class`}>Class</Label>
              <Input
                id={`${id}-class`}
                list={`${id}-classes`}
                value={className}
                onChange={(e) => setClassName(e.target.value)}
              />
              <datalist id={`${id}-classes`}>
                {carClasses.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Start</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-start`}
                checked={start === "empty"}
                onChange={() => setStart("empty")}
              />
              Start empty
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-start`}
                checked={start === "ai"}
                disabled={!prompt}
                onChange={() => setStart("ai")}
              />
              Start from an AI guide
            </label>
            {!prompt && (
              <p className="text-muted">
                An AI guide needs the lap length, direction and every corner’s direction.
              </p>
            )}
          </fieldset>
          {start === "ai" && prompt && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(prompt).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    )
                  }
                >
                  Copy prompt
                </Button>
                <span aria-live="polite" className="text-sm text-muted">
                  {copied && "Copied"}
                </span>
              </div>
              <Label htmlFor={`${id}-answer`}>AI answer</Label>
              <Textarea
                id={`${id}-answer`}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                spellCheck={false}
                className="h-32 font-mono text-xs"
              />
            </div>
          )}
          {problem && (
            <div role="alert" className="space-y-2 text-sm text-danger">
              <p>{problem.message}</p>
              {problem.issues && <IssueList title="Fix these fields" issues={problem.issues} />}
            </div>
          )}
          {add.error && (
            <p role="alert" className="text-sm text-danger">
              Could not add the car: {add.error.message}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={add.isPending}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button
            onClick={submit}
            disabled={
              add.isPending || name.trim() === "" || (start === "ai" && answer.trim() === "")
            }
          >
            Add car
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
