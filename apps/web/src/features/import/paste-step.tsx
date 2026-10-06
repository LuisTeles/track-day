"use client";

import { parseImport, TrackImportPayload, type ImportResult } from "@track-day/schema";
import { useId, useState } from "react";
import { Button } from "@/shared/ui/button";
import { IssueList } from "@/shared/ui/issue-list";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

type Failure = Extract<ImportResult<unknown>, { ok: false }>;
type Status = { kind: "idle" } | { kind: "valid" } | { kind: "invalid"; failure: Failure };

const TITLES: Record<Failure["stage"], string> = {
  parse: "This isn’t valid JSON",
  version: "This JSON is from an unsupported version",
  validate: "The JSON doesn’t match the track format",
};

export function PasteStep({
  onResult,
  disabled = false,
}: {
  onResult(payload: TrackImportPayload | null): void;
  /** Locks the answer, e.g. while it is being saved. */
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const id = useId();

  function handleChange(value: string) {
    setRaw(value);
    // A preview must never outlive the text it was checked from.
    if (status.kind !== "idle") setStatus({ kind: "idle" });
    onResult(null);
  }

  function handleCheck() {
    const result = parseImport(raw, TrackImportPayload);
    if (result.ok) {
      setStatus({ kind: "valid" });
      onResult(result.value);
    } else {
      setStatus({ kind: "invalid", failure: result });
      onResult(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={id}>AI answer</Label>
        <Textarea
          id={id}
          value={raw}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Paste the AI's whole reply. Code fences and text around the JSON are fine."
          spellCheck={false}
          className="h-48 font-mono text-xs"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleCheck} disabled={disabled || raw.trim() === ""}>
          Check JSON
        </Button>
        <p aria-live="polite" className="text-sm text-muted">
          {status.kind === "valid" && "Valid — check the preview below."}
        </p>
      </div>
      {status.kind === "invalid" && (
        <IssueList title={TITLES[status.failure.stage]} issues={status.failure.issues} />
      )}
    </div>
  );
}
