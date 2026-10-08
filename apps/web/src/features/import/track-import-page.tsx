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

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background"
        >
          {n}
        </span>
        <h2 id={id} aria-label={`Step ${n}: ${title}`} className="text-lg font-semibold">
          {title}
        </h2>
      </div>
      <div className="ml-4 flex flex-col gap-4 border-l border-border pl-8">{children}</div>
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
    <div className="flex flex-col gap-10">
      <Step n={1} title="Get the prompt">
        <KnownFactsForm value={draft} onChange={setDraft} />
        <PromptStep facts={facts} />
      </Step>

      <Step n={2} title="Paste the AI’s answer">
        <PasteStep
          disabled={save.isPending || save.isSuccess}
          onResult={(p) => {
            setPayload(p);
            save.reset();
          }}
        />
      </Step>

      {payload && (
        <Step n={3} title="Check and save">
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
