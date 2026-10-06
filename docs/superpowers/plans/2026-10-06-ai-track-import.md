# AI Track Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/tracks/import/` page where the user copies a track prompt, pastes the AI's JSON answer, sees errors by field path or a preview, and saves the track. Plus shadcn/ui set up, and a corner list in the track view for layouts with no outline.

**Architecture:** One client page with three steps, each its own small component in `apps/web/src/features/import/`. Parsing, validation, prompt building and the transactional save already exist (`parseImport`, `buildTrackPrompt`, `trackImport.importTrack`). This plan wires them together. shadcn/ui components are written by hand against the project's existing CSS tokens, so no theme changes.

**Tech Stack:** Next.js 16 (static export, `trailingSlash: true`), React 19, TanStack Query 5, Zod 4, Tailwind v4, shadcn/ui (cva + Radix), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-ai-track-import-design.md`

## Global Constraints

- Track import only. No guide-import UI (it needs cars, which arrive in M4).
- Light, dark and `[data-theme="practice"]` must look the same as before. Don't change existing CSS variable values.
- shadcn's `accent` and `muted` names clash with existing tokens and are **not** aliased. Use `hover:bg-surface` and `text-muted` in components.
- Routes end with a trailing slash (`/tracks/import/`, `/tracks/view/?track=<id>`).
- AI-sourced data is labeled with text, not only color.
- All commands run from the repo root unless stated. Web-app commands: `pnpm --filter web <script>`.
- Commits follow Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- e2e runs against the static export: `pnpm --filter web build` before `pnpm test:e2e`.

## Review Focus

1. **A guide JSON pasted into the track importer** → a validation error at path `kind`, no crash. (Test in Task 4.)
2. **Clicking Save twice** → only one track is created. (Test in Task 6.)
3. **Editing the pasted text after a valid check** → the preview disappears until checked again, so a stale preview is never saved. (Test in Task 4.)
4. **Lap length typed as `0`, `-5` or `abc`** → left out of the prompt, never "Lap length: 0 m". (Test in Task 2.)
5. **A whitespace-only paste** → **Check JSON** stays disabled. (Test in Task 4.)

---

## File structure

| File                                                   | Responsibility                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/web/components.json`                             | shadcn config so future `shadcn add` puts files in the right place |
| `apps/web/src/shared/lib/utils.ts`                     | `cn()`                                                             |
| `apps/web/src/shared/ui/button.tsx`                    | **Replaced:** shadcn-style Button (cva, `asChild`)                 |
| `apps/web/src/shared/ui/{input,textarea,label}.tsx`    | shadcn-style form primitives                                       |
| `apps/web/src/app/globals.css`                         | Adds non-clashing shadcn color aliases                             |
| `apps/web/src/features/import/known-facts.ts`          | `FactsDraft`, `EMPTY_DRAFT`, `toKnownFacts()` (pure)               |
| `apps/web/src/features/import/known-facts-form.tsx`    | Controlled fields for `FactsDraft`                                 |
| `apps/web/src/features/import/prompt-step.tsx`         | Prompt preview + copy with fallback                                |
| `apps/web/src/features/import/paste-step.tsx`          | Textarea, `parseImport`, errors                                    |
| `apps/web/src/features/import/track-preview.tsx`       | Read-only payload summary + duplicate warning                      |
| `apps/web/src/features/import/use-import-track.ts`     | Save mutation + navigation                                         |
| `apps/web/src/features/import/track-import-page.tsx`   | Page state and the three steps                                     |
| `apps/web/src/app/(main)/tracks/import/page.tsx`       | Route                                                              |
| `apps/web/src/features/tracks/track-list.tsx`          | Entry points                                                       |
| `apps/web/src/features/track-view/no-outline.tsx`      | Corner list when a layout has no outline                           |
| `apps/web/src/features/track-view/track-view-page.tsx` | Uses `NoOutline`; shares the side panel                            |
| `apps/web/e2e/import.spec.ts`                          | End-to-end import                                                  |

---

### Task 1: shadcn/ui foundation

**Files:**

- Create: `apps/web/components.json`, `apps/web/src/shared/lib/utils.ts`, `apps/web/src/shared/ui/input.tsx`, `apps/web/src/shared/ui/textarea.tsx`, `apps/web/src/shared/ui/label.tsx`
- Replace: `apps/web/src/shared/ui/button.tsx`
- Modify: `apps/web/src/app/globals.css` (the `@theme inline` block), `apps/web/src/features/tracks/track-list.tsx`, `apps/web/src/features/backup/backup-panel.tsx`
- Test: `apps/web/src/shared/ui/button.test.tsx`

**Interfaces:**

- Produces: `cn(...inputs: ClassValue[]): string` from `@/shared/lib/utils`. `Button` with `variant?: "default" | "outline"` (default `"default"`), `asChild?: boolean`, `type` defaulting to `"button"`. `Input`, `Textarea`, `Label` taking their native element props (`Label` takes Radix Label props). Tailwind colors `primary`, `primary-foreground`, `destructive`, `input`, `ring`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter web add clsx tailwind-merge class-variance-authority @radix-ui/react-slot @radix-ui/react-label
```

- [ ] **Step 2: Write the failing Button test**

`apps/web/src/shared/ui/button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("is a non-submitting button with the primary style by default", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("bg-primary");
  });

  it("renders the outline variant", () => {
    render(<Button variant="outline">Cancel</Button>);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("border-input");
  });

  it("renders its child element with asChild", () => {
    render(
      <Button asChild variant="outline">
        <a href="/tracks/import/">Import with AI</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Import with AI" });
    expect(link).toHaveAttribute("href", "/tracks/import/");
    expect(link).not.toHaveAttribute("type");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/shared/ui/button.test.tsx`
Expected: FAIL (no `bg-primary` class, and `asChild`/`variant="outline"` aren't supported).

- [ ] **Step 4: Add `cn()` and `components.json`**

`apps/web/src/shared/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`apps/web/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/shared",
    "ui": "@/shared/ui",
    "utils": "@/shared/lib/utils",
    "lib": "@/shared/lib",
    "hooks": "@/shared/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 5: Add the color aliases**

In `apps/web/src/app/globals.css`, inside `@theme inline { … }`, after `--color-chip: var(--chip);`, add:

```css
/* shadcn/ui names, mapped onto our tokens. `accent` and `muted` are not
     aliased: ours mean brand red and a text color, shadcn's mean a hover
     background and a background. Adapt `shadcn add` output to use
     `hover:bg-surface` and `text-muted` instead. */
--color-primary: var(--accent);
--color-primary-foreground: var(--accent-foreground);
--color-destructive: var(--danger);
--color-input: var(--border);
--color-ring: var(--accent);
```

- [ ] **Step 6: Replace the Button**

`apps/web/src/shared/ui/button.tsx` (overwrite):

```tsx
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        outline: "border border-input hover:bg-surface",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Button({
  className,
  variant,
  asChild = false,
  type,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

- [ ] **Step 7: Add Input, Textarea and Label**

`apps/web/src/shared/ui/input.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

`apps/web/src/shared/ui/textarea.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
```

`apps/web/src/shared/ui/label.tsx`:

```tsx
"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("text-sm font-medium select-none peer-disabled:opacity-50", className)}
      {...props}
    />
  );
}

export { Label };
```

- [ ] **Step 8: Update the call sites**

Run `grep -rn "variant=" apps/web/src --include="*.tsx" | grep -v shared/ui` to list Button usages. In `track-list.tsx` and `backup-panel.tsx`:

- `variant="primary"` → remove the prop (now the default).
- `variant="secondary"` or no `variant` on a `Button` → `variant="outline"`.

- [ ] **Step 9: Run the tests, typecheck and lint**

Run: `pnpm --filter web exec vitest run && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: all PASS, including the existing `backup-panel.test.tsx`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/components.json apps/web/src/shared apps/web/src/app/globals.css apps/web/src/features/tracks/track-list.tsx apps/web/src/features/backup/backup-panel.tsx
git commit -m "feat(web): set up shadcn/ui on the existing theme tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Known facts — draft model and form

**Files:**

- Create: `apps/web/src/features/import/known-facts.ts`, `apps/web/src/features/import/known-facts-form.tsx`
- Test: `apps/web/src/features/import/known-facts.test.ts`, `apps/web/src/features/import/known-facts-form.test.tsx`

**Interfaces:**

- Consumes: `KnownTrackFacts` from `@track-day/prompts`; `SIMS`, `SimId` from `@track-day/schema`; `Input`, `Label` from Task 1.
- Produces:

  ```ts
  interface FactsDraft {
    trackName: string;
    layoutName: string;
    lengthMeters: string;
    direction: "" | "clockwise" | "anticlockwise";
    cornerCount: string;
    sim: "" | SimId;
  }
  const EMPTY_DRAFT: FactsDraft;
  function toKnownFacts(draft: FactsDraft): KnownTrackFacts;
  function KnownFactsForm(props: {
    value: FactsDraft;
    onChange(draft: FactsDraft): void;
  }): JSX.Element;
  ```

  Field labels: "Track name", "Layout", "Lap length (m)", "Direction", "Number of corners", "Sim".

- [ ] **Step 1: Write the failing tests for `toKnownFacts`**

`apps/web/src/features/import/known-facts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, toKnownFacts } from "./known-facts";

describe("toKnownFacts", () => {
  it("leaves out empty fields", () => {
    expect(toKnownFacts(EMPTY_DRAFT)).toEqual({});
  });

  it("trims text and converts numbers", () => {
    expect(
      toKnownFacts({
        trackName: "  Interlagos ",
        layoutName: "GP",
        lengthMeters: "4309",
        direction: "anticlockwise",
        cornerCount: "15",
        sim: "assetto-corsa",
      }),
    ).toEqual({
      trackName: "Interlagos",
      layoutName: "GP",
      lengthMeters: 4309,
      direction: "anticlockwise",
      cornerCount: 15,
      sim: "assetto-corsa",
    });
  });

  it.each(["0", "-5", "abc", "  "])("leaves out an invalid lap length %j", (lengthMeters) => {
    expect(toKnownFacts({ ...EMPTY_DRAFT, lengthMeters })).toEqual({});
  });

  it("rounds a decimal lap length to whole meters", () => {
    expect(toKnownFacts({ ...EMPTY_DRAFT, lengthMeters: "4309.4" })).toEqual({
      lengthMeters: 4309,
    });
  });

  it.each(["0", "2.5", "x"])("leaves out an invalid corner count %j", (cornerCount) => {
    expect(toKnownFacts({ ...EMPTY_DRAFT, cornerCount })).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/import/known-facts.test.ts`
Expected: FAIL ("Failed to resolve import ./known-facts").

- [ ] **Step 3: Implement `known-facts.ts`**

```ts
import type { KnownTrackFacts } from "@track-day/prompts";
import type { SimId } from "@track-day/schema";

/** The known-facts fields as typed: strings, so half-typed numbers survive. */
export interface FactsDraft {
  trackName: string;
  layoutName: string;
  lengthMeters: string;
  direction: "" | "clockwise" | "anticlockwise";
  cornerCount: string;
  sim: "" | SimId;
}

export const EMPTY_DRAFT: FactsDraft = {
  trackName: "",
  layoutName: "",
  lengthMeters: "",
  direction: "",
  cornerCount: "",
  sim: "",
};

function positiveNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Only facts the user actually gave reach the prompt; anything unusable is left out. */
export function toKnownFacts(draft: FactsDraft): KnownTrackFacts {
  const facts: KnownTrackFacts = {};
  const trackName = draft.trackName.trim();
  if (trackName) facts.trackName = trackName;
  const layoutName = draft.layoutName.trim();
  if (layoutName) facts.layoutName = layoutName;
  const length = positiveNumber(draft.lengthMeters);
  if (length !== null) facts.lengthMeters = Math.round(length);
  if (draft.direction) facts.direction = draft.direction;
  const count = positiveNumber(draft.cornerCount);
  if (count !== null && Number.isInteger(count)) facts.cornerCount = count;
  if (draft.sim) facts.sim = draft.sim;
  return facts;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/import/known-facts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing form test**

`apps/web/src/features/import/known-facts-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, type FactsDraft } from "./known-facts";
import { KnownFactsForm } from "./known-facts-form";

function Harness({ onDraft }: { onDraft(d: FactsDraft): void }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  return (
    <KnownFactsForm
      value={draft}
      onChange={(d) => {
        setDraft(d);
        onDraft(d);
      }}
    />
  );
}

describe("KnownFactsForm", () => {
  it("edits every field", async () => {
    const user = userEvent.setup();
    let last = EMPTY_DRAFT;
    render(<Harness onDraft={(d) => (last = d)} />);

    await user.type(screen.getByLabelText("Track name"), "Interlagos");
    await user.type(screen.getByLabelText("Layout"), "GP");
    await user.type(screen.getByLabelText("Lap length (m)"), "4309");
    await user.selectOptions(screen.getByLabelText("Direction"), "anticlockwise");
    await user.type(screen.getByLabelText("Number of corners"), "15");
    await user.selectOptions(screen.getByLabelText("Sim"), "iracing");

    expect(last).toEqual({
      trackName: "Interlagos",
      layoutName: "GP",
      lengthMeters: "4309",
      direction: "anticlockwise",
      cornerCount: "15",
      sim: "iracing",
    });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/import/known-facts-form.test.tsx`
Expected: FAIL ("Failed to resolve import ./known-facts-form").

- [ ] **Step 7: Implement `known-facts-form.tsx`**

```tsx
"use client";

import { SIMS } from "@track-day/schema";
import { useId } from "react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { FactsDraft } from "./known-facts";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Optional facts the prompt treats as ground truth. Lap length helps most. */
export function KnownFactsForm({
  value,
  onChange,
}: {
  value: FactsDraft;
  onChange(draft: FactsDraft): void;
}) {
  const id = useId();
  const set = <K extends keyof FactsDraft>(key: K, v: FactsDraft[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-2 text-sm text-muted">
        Optional. What you already know goes into the prompt as ground truth — the lap length
        matters most, since every corner distance is scaled from it.
      </legend>
      <div className="space-y-1">
        <Label htmlFor={`${id}-track`}>Track name</Label>
        <Input
          id={`${id}-track`}
          value={value.trackName}
          onChange={(e) => set("trackName", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-layout`}>Layout</Label>
        <Input
          id={`${id}-layout`}
          placeholder="GP"
          value={value.layoutName}
          onChange={(e) => set("layoutName", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-length`}>Lap length (m)</Label>
        <Input
          id={`${id}-length`}
          inputMode="numeric"
          value={value.lengthMeters}
          onChange={(e) => set("lengthMeters", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-corners`}>Number of corners</Label>
        <Input
          id={`${id}-corners`}
          inputMode="numeric"
          value={value.cornerCount}
          onChange={(e) => set("cornerCount", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-direction`}>Direction</Label>
        <select
          id={`${id}-direction`}
          className={selectClass}
          value={value.direction}
          onChange={(e) => set("direction", e.target.value as FactsDraft["direction"])}
        >
          <option value="">Not sure</option>
          <option value="clockwise">Clockwise</option>
          <option value="anticlockwise">Anticlockwise</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-sim`}>Sim</Label>
        <select
          id={`${id}-sim`}
          className={selectClass}
          value={value.sim}
          onChange={(e) => set("sim", e.target.value as FactsDraft["sim"])}
        >
          <option value="">Any</option>
          {SIMS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `pnpm --filter web exec vitest run src/features/import`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/import
git commit -m "feat(web): add the known-facts form for the track prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Prompt step

**Files:**

- Create: `apps/web/src/features/import/prompt-step.tsx`
- Test: `apps/web/src/features/import/prompt-step.test.tsx`

**Interfaces:**

- Consumes: `buildTrackPrompt`, `KnownTrackFacts` from `@track-day/prompts`; `Button`, `Textarea` from Task 1.
- Produces: `PromptStep({ facts }: { facts: KnownTrackFacts })`. A **Copy prompt** button; a `<details>` with summary "Show prompt" containing a read-only textarea labeled "Prompt"; a status of "Copied" or "Couldn’t copy automatically — press Ctrl/Cmd+C to copy the selected prompt."

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/import/prompt-step.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PromptStep } from "./prompt-step";

describe("PromptStep", () => {
  it("builds the prompt from the known facts", () => {
    render(<PromptStep facts={{ lengthMeters: 4309 }} />);
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toContain(
      "Lap length: 4309 m",
    );
  });

  it("copies the prompt to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<PromptStep facts={{}} />);

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("## JSON Schema"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("falls back to selecting the prompt when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<PromptStep facts={{}} />);

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(await screen.findByText(/press Ctrl\/Cmd\+C/)).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/import/prompt-step.test.tsx`
Expected: FAIL ("Failed to resolve import ./prompt-step").

- [ ] **Step 3: Implement `prompt-step.tsx`**

```tsx
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/import/prompt-step.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/import/prompt-step.tsx apps/web/src/features/import/prompt-step.test.tsx
git commit -m "feat(web): add the copy-prompt step for track import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Paste step

**Files:**

- Create: `apps/web/src/features/import/paste-step.tsx`
- Test: `apps/web/src/features/import/paste-step.test.tsx`

**Interfaces:**

- Consumes: `parseImport`, `TrackImportPayload`, `FieldIssue` from `@track-day/schema`; `IssueList` from `@/shared/ui/issue-list`; `Button`, `Textarea`, `Label` from Task 1.
- Produces: `PasteStep({ onResult }: { onResult(payload: TrackImportPayload | null): void })`. A textarea labeled "AI answer" and a **Check JSON** button. Calls `onResult(payload)` on a valid check, and `onResult(null)` on an invalid check or any edit.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/import/paste-step.test.tsx`:

````tsx
import interlagos from "@examples/interlagos.track.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasteStep } from "./paste-step";

async function paste(text: string) {
  const user = userEvent.setup();
  const onResult = vi.fn();
  render(<PasteStep onResult={onResult} />);
  await user.click(screen.getByLabelText("AI answer"));
  await user.paste(text);
  return { user, onResult };
}

const check = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Check JSON" }));

describe("PasteStep", () => {
  it("accepts the Interlagos sample wrapped in a code fence and prose", async () => {
    const { user, onResult } = await paste(
      "Here you go:\n```json\n" + JSON.stringify(interlagos) + "\n```\nHope this helps!",
    );
    await check(user);

    expect(onResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ track: expect.objectContaining({ name: interlagos.track.name }) }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains text that isn't JSON", async () => {
    const { user, onResult } = await paste("Sorry, I can't see the image.");
    await check(user);

    expect(screen.getByRole("alert")).toHaveTextContent("This isn’t valid JSON");
    expect(onResult).toHaveBeenLastCalledWith(null);
  });

  it("shows schema errors by field path", async () => {
    const broken = structuredClone(interlagos);
    (broken.corners[0] as { direction: string }).direction = "sideways";
    const { user } = await paste(JSON.stringify(broken));
    await check(user);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("doesn’t match the track format");
    expect(alert).toHaveTextContent("corners[0].direction");
  });

  it("rejects a guide pasted into the track importer", async () => {
    const { user, onResult } = await paste(
      JSON.stringify({ schemaVersion: 1, kind: "guide", guide: {}, corners: [] }),
    );
    await check(user);

    expect(screen.getByRole("alert")).toHaveTextContent("kind");
    expect(onResult).toHaveBeenLastCalledWith(null);
  });

  it("clears a valid result when the text is edited", async () => {
    const { user, onResult } = await paste(JSON.stringify(interlagos));
    await check(user);
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "track" }));

    await user.type(screen.getByLabelText("AI answer"), " ");

    expect(onResult).toHaveBeenLastCalledWith(null);
  });

  it("keeps Check JSON disabled for an empty or whitespace-only answer", async () => {
    await paste("   \n  ");
    expect(screen.getByRole("button", { name: "Check JSON" })).toBeDisabled();
  });
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/import/paste-step.test.tsx`
Expected: FAIL ("Failed to resolve import ./paste-step").

- [ ] **Step 3: Implement `paste-step.tsx`**

```tsx
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

export function PasteStep({ onResult }: { onResult(payload: TrackImportPayload | null): void }) {
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
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Paste the AI's whole reply. Code fences and text around the JSON are fine."
          spellCheck={false}
          className="h-48 font-mono text-xs"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleCheck} disabled={raw.trim() === ""}>
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/import/paste-step.test.tsx`
Expected: PASS. If the guide case shows a different path than `kind` (Zod may report the literal mismatch at `kind`), check the alert text with `screen.debug()` and keep the assertion on the reported path. It must be an `alert`, not a crash.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/import/paste-step.tsx apps/web/src/features/import/paste-step.test.tsx
git commit -m "feat(web): add the paste step with lenient parsing and field-path errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Track preview

**Files:**

- Create: `apps/web/src/features/import/track-preview.tsx`
- Test: `apps/web/src/features/import/track-preview.test.tsx`

**Interfaces:**

- Consumes: `TrackImportPayload`, `simLabel` from `@track-day/schema`.
- Produces: `TrackPreview({ payload, existingNames }: { payload: TrackImportPayload; existingNames: string[] })`. The corners render as `<ol aria-label="Corners">`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/import/track-preview.test.tsx`:

```tsx
import interlagos from "@examples/interlagos.track.json";
import { TrackImportPayload } from "@track-day/schema";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackPreview } from "./track-preview";

const payload = TrackImportPayload.parse(interlagos);

describe("TrackPreview", () => {
  it("summarises the track, layout and corners in lap order", () => {
    render(<TrackPreview payload={payload} existingNames={[]} />);

    expect(screen.getByText(payload.track.name)).toBeInTheDocument();
    expect(screen.getByText(/4309 m/)).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Corners" })).getAllByRole("listitem");
    expect(items).toHaveLength(payload.corners.length);
    expect(items[0]).toHaveTextContent("S do Senna");
    expect(screen.getByText(/From AI/)).toBeInTheDocument();
  });

  it("warns, without blocking, when a track with the same name exists", () => {
    render(
      <TrackPreview payload={payload} existingNames={[`  ${payload.track.name.toUpperCase()} `]} />,
    );
    expect(screen.getByText(/You already have a track named/)).toBeInTheDocument();
  });

  it("does not warn for a different name", () => {
    render(<TrackPreview payload={payload} existingNames={["Suzuka Circuit"]} />);
    expect(screen.queryByText(/You already have a track named/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/import/track-preview.test.tsx`
Expected: FAIL ("Failed to resolve import ./track-preview").

- [ ] **Step 3: Implement `track-preview.tsx`**

```tsx
import { simLabel, type TrackImportPayload } from "@track-day/schema";

const normalize = (name: string) => name.trim().toLocaleLowerCase();

export function TrackPreview({
  payload,
  existingNames,
}: {
  payload: TrackImportPayload;
  existingNames: string[];
}) {
  const { track, layout, corners } = payload;
  const complexes = payload.complexes ?? [];
  const segments = payload.segments ?? [];
  const duplicate = existingNames.some((n) => normalize(n) === normalize(track.name));
  const details = [track.aliases?.join(", "), track.city, track.country].filter(Boolean);

  return (
    <div className="space-y-5 text-sm">
      <p className="inline-block rounded-md border border-border px-2 py-0.5 text-xs text-muted">
        From AI — estimates until confirmed
      </p>
      {duplicate && (
        <p className="rounded-md border border-border bg-surface p-3">
          You already have a track named “{track.name}”. Saving creates a separate track.
        </p>
      )}

      <div>
        <p className="text-base font-medium">{track.name}</p>
        {details.length > 0 && <p className="text-muted">{details.join(" · ")}</p>}
        {track.sims && track.sims.length > 0 && (
          <p className="text-muted">In {track.sims.map((s) => simLabel(s.sim)).join(", ")}</p>
        )}
        <p className="mt-1">
          Layout {layout.name} · {layout.lengthMeters} m · {layout.direction}
        </p>
      </div>

      <div>
        <h3 className="mb-1 font-medium">{corners.length} corners</h3>
        <ol aria-label="Corners" className="divide-y divide-border rounded-lg border border-border">
          {corners.map((c) => (
            <li key={c.number} className="flex items-center gap-3 px-3 py-1.5">
              <span className="w-8 shrink-0 font-semibold tabular-nums">T{c.number}</span>
              <span className="flex-1">{c.name ?? <span className="text-muted">—</span>}</span>
              <span className="text-muted capitalize">
                {[c.direction, c.type].filter(Boolean).join(" · ")}
              </span>
              <span className="w-16 text-right text-muted tabular-nums">
                {c.distanceFromStartMeters != null ? `${c.distanceFromStartMeters} m` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {complexes.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Complexes</h3>
          <ul className="space-y-0.5">
            {complexes.map((c) => (
              <li key={c.name}>
                {c.name} <span className="text-muted">· T{c.cornerNumbers.join(", T")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {segments.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Segments</h3>
          <ul className="space-y-0.5">
            {segments.map((s) => (
              <li key={s.name}>
                {s.name}
                {(s.fromCorner != null || s.toCorner != null) && (
                  <span className="text-muted">
                    {" "}
                    · T{s.fromCorner ?? "?"} → T{s.toCorner ?? "?"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/import/track-preview.test.tsx && pnpm --filter web typecheck`
Expected: PASS. If typecheck flags a field (for example `type` or `distanceFromStartMeters` being typed differently), read the `TrackImportPayload` corner schema in `packages/schema/src/payloads.ts` and match it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/import/track-preview.tsx apps/web/src/features/import/track-preview.test.tsx
git commit -m "feat(web): add the track import preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Import page, save, route and entry points

**Files:**

- Create: `apps/web/src/features/import/use-import-track.ts`, `apps/web/src/features/import/track-import-page.tsx`, `apps/web/src/app/(main)/tracks/import/page.tsx`
- Modify: `apps/web/src/features/tracks/track-list.tsx`
- Test: `apps/web/src/features/import/track-import-page.test.tsx`

**Interfaces:**

- Consumes: everything from Tasks 1–5; `useTracks` from `@/features/tracks/use-tracks`; `useRepositories` from `@/data/provider`; `queryKeys` from `@/data/query-keys`; `useRouter` from `next/navigation`.
- Produces: `useImportTrack()` (a TanStack mutation taking a `TrackImportPayload`); `TrackImportPage()`; the route `/tracks/import/`. Each step is a `<section>` labeled by its `h2`: "1. Get the prompt", "2. Paste the AI’s answer", "3. Check and save".

- [ ] **Step 1: Write the failing page test**

`apps/web/src/features/import/track-import-page.test.tsx`:

```tsx
import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackImportPage } from "./track-import-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function setup(importTrack = vi.fn().mockResolvedValue({ trackId: "t1", layoutId: "l1" })) {
  const repos = {
    tracks: { list: vi.fn().mockResolvedValue([]) },
    trackImport: { importTrack },
  } as unknown as Repositories;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos}>
        <TrackImportPage />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { importTrack };
}

async function pasteValid(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("AI answer"));
  await user.paste(JSON.stringify(interlagos));
  await user.click(screen.getByRole("button", { name: "Check JSON" }));
}

describe("TrackImportPage", () => {
  beforeEach(() => push.mockReset());

  it("shows the preview only after a valid check", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("region", { name: "3. Check and save" })).not.toBeInTheDocument();

    await pasteValid(user);

    expect(screen.getByRole("region", { name: "3. Check and save" })).toBeInTheDocument();
  });

  it("saves once and opens the new track", async () => {
    const user = userEvent.setup();
    const { importTrack } = setup();
    await pasteValid(user);

    const save = screen.getByRole("button", { name: "Save track" });
    await user.click(save);
    await user.click(save);

    expect(importTrack).toHaveBeenCalledTimes(1);
    expect(importTrack).toHaveBeenCalledWith(expect.objectContaining({ kind: "track" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/tracks/view/?track=t1"));
  });

  it("keeps the pasted text and shows the error when saving fails", async () => {
    const user = userEvent.setup();
    setup(vi.fn().mockRejectedValue(new Error("Disk full")));
    await pasteValid(user);

    await user.click(screen.getByRole("button", { name: "Save track" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect((screen.getByLabelText("AI answer") as HTMLTextAreaElement).value).toContain(
      interlagos.track.name,
    );
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/import/track-import-page.test.tsx`
Expected: FAIL ("Failed to resolve import ./track-import-page").

- [ ] **Step 3: Implement `use-import-track.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrackImportPayload } from "@track-day/schema";
import { useRouter } from "next/navigation";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";

/** Saves an imported track in one transaction, then opens it. */
export function useImportTrack() {
  const { trackImport } = useRepositories();
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (payload: TrackImportPayload) => trackImport.importTrack(payload),
    onSuccess: async ({ trackId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      router.push(`/tracks/view/?track=${trackId}`);
    },
  });
}
```

- [ ] **Step 4: Implement `track-import-page.tsx`**

```tsx
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
```

- [ ] **Step 5: Run the page test to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/import/track-import-page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add the route**

`apps/web/src/app/(main)/tracks/import/page.tsx`:

```tsx
import type { Metadata } from "next";
import { TrackImportPage } from "@/features/import/track-import-page";

export const metadata: Metadata = { title: "Import track · Track Day" };

export default function ImportPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import a track with AI</h1>
        <p className="text-sm text-muted">
          No API key needed: copy a prompt, ask any AI chat with a track map, paste the answer back.
        </p>
      </div>
      <TrackImportPage />
    </section>
  );
}
```

- [ ] **Step 7: Add the entry points in `track-list.tsx`**

Add `import Link from "next/link";` if it isn't imported (it already is). In the empty state, replace the paragraph text and the button area:

```tsx
        <p className="mt-1 text-sm text-muted">
          Import a track with AI from a map image, load the sample tracks (Interlagos and Suzuka)
          to explore the app, or restore a backup.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/tracks/import/">Import with AI</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => loadSamples.mutate()}
            disabled={loadSamples.isPending}
          >
            {loadSamples.isPending ? "Loading…" : "Load sample tracks"}
          </Button>
        </div>
```

(This replaces the single `<Button variant=… className="mt-4" …>Load sample tracks</Button>`.) In the populated branch, wrap the return so a link sits above the list:

```tsx
return (
  <div className="space-y-3">
    <div className="flex justify-end">
      <Button asChild variant="outline">
        <Link href="/tracks/import/">Import with AI</Link>
      </Button>
    </div>
    <ul className="divide-y divide-border rounded-lg border border-border">
      {/* …existing items unchanged… */}
    </ul>
  </div>
);
```

The existing `<ul>` and its children stay exactly as they are. Only the wrapper and link are new.

- [ ] **Step 8: Run everything**

Run: `pnpm --filter web exec vitest run && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/import apps/web/src/app/\(main\)/tracks apps/web/src/features/tracks/track-list.tsx
git commit -m "feat(web): add the AI track import page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Corner list for layouts without an outline

**Files:**

- Create: `apps/web/src/features/track-view/no-outline.tsx`
- Modify: `apps/web/src/features/track-view/track-view-page.tsx` (the `if (!layout?.outlinePath)` block around line 132, and the `panel={…}` prop of the final return)
- Test: `apps/web/src/features/track-view/no-outline.test.tsx`

**Interfaces:**

- Consumes: `CornerList` from `./corner-details`; `Corner` type from `@track-day/schema`.
- Produces: `NoOutline({ corners, onSelect }: { corners: Corner[]; onSelect(id: string): void })`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/track-view/no-outline.test.tsx`:

```tsx
import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoOutline } from "./no-outline";

const corner = (number: number, name: string | null): Corner =>
  ({ id: `c${number}`, number, name, direction: "left" }) as Corner;

describe("NoOutline", () => {
  it("lists the corners in lap order and selects one", async () => {
    const onSelect = vi.fn();
    render(<NoOutline corners={[corner(1, "S do Senna"), corner(2, null)]} onSelect={onSelect} />);

    expect(screen.getByText(/no outline yet/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("S do Senna");
    expect(buttons[1]).toHaveTextContent("Unnamed");

    await userEvent.click(buttons[0]!);
    expect(onSelect).toHaveBeenCalledWith("c1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/track-view/no-outline.test.tsx`
Expected: FAIL ("Failed to resolve import ./no-outline").

- [ ] **Step 3: Implement `no-outline.tsx`**

```tsx
import type { Corner } from "@track-day/schema";
import { CornerList } from "./corner-details";

/** Stands in for the map when a layout has no outline (e.g. right after an AI import). */
export function NoOutline({
  corners,
  onSelect,
}: {
  corners: Corner[];
  onSelect(id: string): void;
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pt-20 pb-24">
      <div className="mx-auto max-w-md space-y-3 rounded-xl border border-border bg-background p-4">
        <div>
          <h2 className="font-medium">Corners</h2>
          <p className="text-sm text-muted">
            This layout has no outline yet, so there’s no map. The map appears once an outline is
            added.
          </p>
        </div>
        <CornerList corners={corners} onSelect={onSelect} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/track-view/no-outline.test.tsx`
Expected: PASS.

- [ ] **Step 5: Use it in the track view**

In `track-view-page.tsx`, add `import { NoOutline } from "./no-outline";`. Replace the whole block

```tsx
if (!layout?.outlinePath) {
  return (
    <TrackViewShell
      topBar={topBar}
      canvas={<Message>This layout has no outline yet, so there’s no map to show.</Message>}
      controls={null}
      panel={null}
    />
  );
}
```

with

```tsx
if (!layout) {
  return (
    <TrackViewShell
      topBar={topBar}
      canvas={<Message>This track has no layouts yet.</Message>}
      controls={null}
      panel={null}
    />
  );
}

const panel = (
  <SidePanel
    open={selected !== null || listOpen}
    title={selected ? cornerTitle(selected) : "Corners"}
    onClose={closePanel}
  >
    {/* moved here unchanged from the final return's panel prop */}
  </SidePanel>
);

if (!layout.outlinePath) {
  return (
    <TrackViewShell
      topBar={topBar}
      canvas={<NoOutline corners={corners} onSelect={selectCorner} />}
      controls={null}
      panel={panel}
    />
  );
}
```

Then **cut** the children of the `<SidePanel>` from the final return's `panel={…}` prop (the `{selected ? (<CornerDetails …/>) : (<CornerList …/>)}` expression, unchanged) and paste them into the `panel` constant in place of the comment. Change the final return's prop to `panel={panel}`. `layout.outlinePath` is now narrowed to `string` in the final `TrackCanvas`.

- [ ] **Step 6: Run everything**

Run: `pnpm --filter web exec vitest run && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/track-view
git commit -m "feat(web): list corners in the track view when a layout has no outline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end import test and docs

**Files:**

- Create: `apps/web/e2e/import.spec.ts`
- Modify: `docs/PLAN.md` (M2 and M3 checkboxes)

**Interfaces:**

- Consumes: the UI from Tasks 1–7. Labels: link "Import with AI", field "Lap length (m)", button "Copy prompt", status "Copied", field "AI answer", button "Check JSON", region "3. Check and save", button "Save track".

- [ ] **Step 1: Write the e2e test**

`apps/web/e2e/import.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import interlagos from "../../../examples/interlagos.track.json";

/** What an AI chat would send back: no geometry, wrapped in a fence and prose. */
function aiAnswer(): string {
  const layout: Record<string, unknown> = { ...interlagos.layout };
  delete layout.outlinePath;
  delete layout.racingLinePath;
  delete layout.rotation;
  const corners = interlagos.corners.map((c) => {
    const copy: Record<string, unknown> = { ...c };
    delete copy.pathPosition;
    delete copy.labelOffset;
    return copy;
  });
  const json = JSON.stringify({ ...interlagos, layout, corners }, null, 2);
  return `Here is the track:\n\n\`\`\`json\n${json}\n\`\`\`\n\nLet me know if you need anything else.`;
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("imports a track pasted from an AI chat", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Import with AI" }).click();
  await expect(page.getByRole("heading", { name: "Import a track with AI" })).toBeVisible();

  await page.getByLabel("Lap length (m)").fill("4309");
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await expect(page.getByText("Copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Lap length: 4309 m");

  await page.getByLabel("AI answer").fill(aiAnswer());
  await page.getByRole("button", { name: "Check JSON" }).click();
  const preview = page.getByRole("region", { name: "3. Check and save" });
  await expect(preview.getByText("S do Senna").first()).toBeVisible();

  await page.getByRole("button", { name: "Save track" }).click();
  await expect(page).toHaveURL(/\/tracks\/view\/\?track=/);
  await expect(page.getByRole("button", { name: /S do Senna/ }).first()).toBeVisible();
});

test("shows errors by field path for an invalid answer", async ({ page }) => {
  await page.goto("/tracks/import/");
  await page.getByLabel("AI answer").fill(
    JSON.stringify({
      schemaVersion: 1,
      kind: "track",
      track: { name: "Test" },
      layout: { name: "GP", lengthMeters: 1000, direction: "sideways" },
      corners: [],
    }),
  );
  await page.getByRole("button", { name: "Check JSON" }).click();

  await expect(page.getByRole("alert")).toContainText("layout.direction");
  await expect(page.getByRole("region", { name: "3. Check and save" })).toHaveCount(0);
});
```

- [ ] **Step 2: Build and run the e2e suite**

Run: `pnpm --filter web build && pnpm test:e2e`
Expected: all specs PASS on both `chromium` and `mobile`, including the existing smoke, track-view, practice and offline specs. If the clipboard assertions fail only on the `mobile` project, scope the copy assertions with `test.skip(testInfo.project.name === "mobile", …)` inside a separate test rather than weakening the import test, and report that in the task summary.

- [ ] **Step 3: Tick the roadmap**

In `docs/PLAN.md`, change these lines from `- [ ]` to `- [x]`:

- M2: `shadcn/ui setup`
- M3: `Copy-prompt screen`, `Paste + lenient parse`, `Validation errors by field path`, `Preview before save`, `Interlagos e2e test`

- [ ] **Step 4: Run the full CI sequence locally**

Run: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm -r exec vitest run`
Expected: all PASS. If `format:check` fails, run `pnpm format` and re-check.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/import.spec.ts docs/PLAN.md
git commit -m "test(web): cover the AI track import end to end and complete M3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
