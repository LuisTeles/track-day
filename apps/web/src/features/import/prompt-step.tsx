"use client";

import { buildTrackPrompt, type KnownTrackFacts } from "@track-day/prompts";
import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";

type CopyState = { kind: "copied" | "manual"; prompt: string } | null;

export function PromptStep({ facts }: { facts: KnownTrackFacts }) {
  const prompt = useMemo(() => buildTrackPrompt(facts), [facts]);
  const [open, setOpen] = useState(false);
  // Tied to the prompt it was for, so editing the facts clears it.
  const [copy, setCopy] = useState<CopyState>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopy({ kind: "copied", prompt });
    } catch {
      setCopy({ kind: "manual", prompt });
      setOpen(true);
      requestAnimationFrame(() => {
        textarea.current?.focus();
        textarea.current?.select();
      });
    }
  }

  const status = copy?.prompt === prompt ? copy.kind : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleCopy}>Copy prompt</Button>
        <p aria-live="polite" className="text-sm text-muted">
          {status === "copied" && "Copied"}
          {status === "manual" &&
            "Couldn’t copy automatically — press Ctrl/Cmd+C to copy the selected prompt."}
        </p>
      </div>
      <p className="text-sm text-muted">
        Paste it into any AI chat (ChatGPT, Claude, Gemini…) together with a track map image.
      </p>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm">Show prompt</summary>
        <label htmlFor={id} className="sr-only">
          Prompt
        </label>
        <Textarea
          id={id}
          ref={textarea}
          readOnly
          value={prompt}
          className="mt-2 h-64 font-mono text-xs"
        />
      </details>
    </div>
  );
}
