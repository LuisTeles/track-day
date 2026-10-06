"use client";

import type { TrackImportPayload } from "@track-day/schema";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useTracks } from "@/features/tracks/use-tracks";
import { Button } from "@/shared/ui/button";
import { EMPTY_DRAFT, toKnownFacts } from "./known-facts";
import { KnownFactsForm } from "./known-facts-form";
import { PasteStep } from "./paste-step";
import { PromptStep } from "./prompt-step";
import { TrackPreview } from "./track-preview";
import { useImportTrack } from "./use-import-track";

function Step({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-lg font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function TrackImportPage() {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const facts = useMemo(() => toKnownFacts(draft), [draft]);
  const [payload, setPayload] = useState<TrackImportPayload | null>(null);
  const { data: tracks } = useTracks();
  const save = useImportTrack();

  return (
    <div className="space-y-10">
      <Step title="1. Get the prompt">
        <KnownFactsForm value={draft} onChange={setDraft} />
        <PromptStep facts={facts} />
      </Step>

      <Step title="2. Paste the AI’s answer">
        <PasteStep
          disabled={save.isPending || save.isSuccess}
          onResult={(p) => {
            setPayload(p);
            save.reset();
          }}
        />
      </Step>

      {payload && (
        <Step title="3. Check and save">
          <TrackPreview payload={payload} existingNames={(tracks ?? []).map((t) => t.name)} />
          <div className="space-y-2">
            <Button
              onClick={() => save.mutate(payload)}
              disabled={save.isPending || save.isSuccess}
            >
              {save.isPending ? "Saving…" : "Save track"}
            </Button>
            {save.error && (
              <p role="alert" className="text-sm text-danger">
                Could not save the track: {save.error.message}
              </p>
            )}
          </div>
        </Step>
      )}
    </div>
  );
}
