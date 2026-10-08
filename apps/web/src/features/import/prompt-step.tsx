"use client";

import { buildTrackPrompt, type KnownTrackFacts } from "@track-day/prompts";
import { Check } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";

type CopyState = { kind: "copied" | "manual"; prompt: string } | null;

export function PromptStep({ facts }: { facts: KnownTrackFacts }) {
  const prompt = useMemo(() => buildTrackPrompt(facts), [facts]);
  const [open, setOpen] = useState(false);
  // Tied to the prompt it was for, so editing the facts clears it.
  const [copy, setCopy] = useState<CopyState>(null);
  const [flash, setFlash] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 2000);
    return () => clearTimeout(t);
  }, [flash]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopy({ kind: "copied", prompt });
      setFlash(true);
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
        <Button onClick={handleCopy}>
          {flash && status === "copied" ? <Check aria-hidden /> : null}
          Copy prompt
        </Button>
        <p aria-live="polite" className="text-sm text-muted">
          {status === "copied" && "Copied"}
          {status === "manual" &&
            "Couldn’t copy automatically — press Ctrl/Cmd+C to copy the selected prompt."}
        </p>
      </div>
      <p className="text-sm text-muted">
        Paste it into any AI chat (ChatGPT, Claude, Gemini…) together with a track map image.
      </p>
      <div>
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={`${id}-region`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide prompt" : "Show prompt"}
        </Button>
        <div id={`${id}-region`} hidden={!open}>
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
        </div>
      </div>
    </div>
  );
}
