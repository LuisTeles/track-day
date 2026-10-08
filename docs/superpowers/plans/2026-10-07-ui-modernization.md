# UI Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app a consistent, modern design system — fixed spacing and sizing, touch-friendly controls, a light/dark/system theme, real icons, and accessibility and quality-of-life features — without changing what the app does.

**Architecture:** Fix the foundation first (tokens, base CSS, primitives), then rebuild each surface on it: the app shell and standard pages, the track view (top bar, toolbar, side panel, forms, markers), and practice mode. An axe-core Playwright suite goes in first with a per-page allowlist of current violations; each task shrinks the allowlist, and the last task requires it to be empty. All work stays in `apps/web`; no data model, repository or schema changes.

**Tech Stack:** Next.js 16 (static export), React 19, Tailwind CSS 4.3, Radix primitives (shadcn "new-york" style), Vitest + Testing Library, Playwright. New: `lucide-react`, `@radix-ui/react-popover`, `@radix-ui/react-dropdown-menu`, `@axe-core/playwright` (dev).

**Spec:** None was written; the **Design decisions** section below is the spec. Review it before anything else — every task argues from it.

## Design decisions (the spec)

Found while reading the code on 2026-10-07. Each problem is listed with the decision that fixes it.

**Sizing and spacing**

| Problem (where)                                                                                                                        | Decision                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons are ~32 px tall (`px-3 py-1.5`), toolbar buttons ~32 px, the top bar's Practice link and layout select ~24 px (`py-0.5`)       | Controls are **40 px** tall (`h-10`) on fine pointers and **44 px** on coarse pointers (`pointer-coarse:h-11`). Icon buttons are square at the same size.                                                 |
| Panel close button is a `✕` glyph in a ~24 px box; corner prev/next are bare text buttons with no padding                              | Icon button primitive (`size="icon"`), lucide icons, 40/44 px hit areas.                                                                                                                                  |
| Inputs are `h-9 text-sm` (14 px), so iOS Safari zooms the page on focus                                                                | Inputs/selects/textareas are `h-10 text-base md:text-sm` (16 px on phones).                                                                                                                               |
| Corner guide form uses `grid-cols-3` inside the 384 px panel; labels like "Minimum speed (km/h)" wrap to two lines and misalign inputs | Two columns, short labels ("Entry", "Minimum", "Exit"), units shown as an input suffix and included in the accessible name.                                                                               |
| Ad-hoc vertical rhythm (`space-y-6`, `space-y-8`, `space-y-10`, `py-8`) and heading sizes (`text-2xl`, `text-lg`, `text-base`)         | One rhythm: page `gap-8`, section `gap-4`, field `gap-1.5`. One heading scale: page `text-2xl/tight font-semibold`, section `text-lg font-semibold`, card `text-base font-semibold`. Shared `PageHeader`. |
| 11 px text (map chips, OSM credit)                                                                                                     | 12 px minimum anywhere (`text-xs`).                                                                                                                                                                       |
| Corner markers are 26 px — below the 44 px coarse-pointer target                                                                       | Visual badge 28 px; an invisible `::before` extends the hit area to 44 px.                                                                                                                                |
| Track-view toolbar has 9+ controls and wraps into 2–3 rows on a phone, covering the map                                                | One row: zoom group, a **Layers** menu (Speed & gear, Racing line), car picker, Edit, Corners, overflow menu (Reset view, Redo map). Horizontal scroll as a last resort, never wrap.                      |
| `statusBarStyle: "black-translucent"` puts the floating top bar under the iPhone notch/status bar; no `viewport-fit=cover`             | `viewportFit: "cover"` and `*-safe-*` padding utilities on every fixed edge (top bar, toolbar, bottom sheet, practice controls).                                                                          |

**Modern UI/UX**

- **Theme:** light / dark / system choice in the header (stored per browser), with a no-flash inline script and a `theme-color` that follows the scheme. Practice mode stays forced dark.
- **Icons:** `lucide-react` (already named in `components.json`) replaces text glyphs `✕ ← ‹ › + −`. Icons are `aria-hidden`; names come from text or `aria-label`.
- **Track list:** cards in a responsive grid with location and a chevron, skeleton while loading, a search box once there are 6+ tracks.
- **Dialogs instead of `window.confirm`:** "Discard unsaved changes?" and "place the apex here anyway?" use the app's AlertDialog through a `useConfirm()` promise hook.
- **Practice Options:** a Radix Popover instead of `<details>` (closes on Escape/outside click, returns focus).
- **Toasts:** one polite live region for outcomes that otherwise vanish (backup downloaded, track deleted, samples loaded).

**Accessibility**

- Skip link to `#main`; `aria-current="page"` on the active nav link.
- One focus style everywhere (`focus-ring` utility: 2 px ring color, 2 px offset). Currently mixed between `outline-ring` and `outline-accent`.
- `prefers-reduced-motion` turns off transitions and the marker hover scale (zoom already respects it in `use-zoom.ts`).
- `role="toolbar"` gets real roving-tabindex arrow-key behavior (today it has the role but none of the keyboard contract).
- Estimate badge uses the `estimate` token instead of `amber-700 dark:amber-300` (the only `dark:` class, which would break under a manual theme).
- Track-view keyboard shortcuts (`[` `]` prev/next corner, `+` `-` zoom, `0` reset, `c` corners, `e` edit, `?` help) with a help dialog; never fire while typing.
- Axe (WCAG 2.2 AA tags) runs on every page in e2e and must pass at the end.

**Out of scope:** new features, data-model changes, undo for deletes, drag-to-resize bottom sheet, i18n, a design-token package.

## Global Constraints

- All work in `apps/web`. No changes to `packages/*` or the IndexedDB schema.
- Keep every existing accessible name that e2e tests use unless the task updates that test in the same commit: "Load sample tracks", "Import with AI", "Practice", "Zoom in", "Zoom out", "Reset view", "Speed & gear", "Racing line", "Edit", "Corners", "Close panel", "Previous corner", "Next corner", "Backup file", "Save note", `Turn N, …` marker names.
- Practice mode keeps `data-theme="practice"` and stays dark regardless of the theme choice.
- Theme choice key is `theme` in localStorage with values `system | light | dark`; the stored-choice in-memory fallback must still work when storage throws.
- Control heights: `h-10` default, `pointer-coarse:h-11`; nothing interactive smaller than 24×24 CSS px (WCAG 2.5.8) and markers' hit area ≥ 44 px.
- Minimum text size 12 px (`text-xs`); form inputs 16 px below `md`.
- Colors only via tokens in `globals.css` (`bg-surface`, `text-muted`, …). No raw Tailwind palette colors (`amber-*`, `emerald-*`) in components.
- Commit messages follow Conventional Commits with scope `web` (commitlint is enforced).
- Run from repo root: `pnpm --filter web test`, `pnpm --filter web typecheck`, `pnpm --filter web lint`; e2e needs `pnpm --filter web build` first, then `pnpm test:e2e`.
- Read `apps/web/AGENTS.md`: this Next.js version differs from training data; check `apps/web/node_modules/next/dist/docs/` before using Next APIs (`viewport`, `metadata`, inline scripts in the root layout).

## Review Focus

1. **Unsaved edits with the async confirm dialog** — clicking "← Tracks", "Practice", another marker, or changing layout/car while a form is dirty must still ask, and "Keep editing" must leave the URL, selection and draft untouched. (Tests added in Task 10.)
2. **Theme on first paint** — a stored `dark` choice on a light-OS device must not flash light, and storage that throws must fall back to system without crashing. (Tests in Task 2.)
3. **Shortcuts while typing** — pressing `e`, `c`, `[`, `0` inside the guide form, quick-note textarea, layout/car `<select>`, or with Ctrl/Cmd held must not trigger a shortcut. (Tests in Task 12.)
4. **Phone in standalone mode** — top bar, toolbar, bottom sheet and practice controls must clear the notch and home indicator, and the toolbar must stay one row at 360 px wide. (e2e in Tasks 8 and 14.)
5. **Escape layering** — Escape closes the innermost thing only: an open menu/popover/dialog first, then a line-point pick, then the side panel; in practice, Escape inside Options must not exit practice. (Tests in Tasks 8, 10 and 14.)

---

## File structure

**Create**

| File                                                    | Responsibility                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/web/e2e/a11y.spec.ts`                             | Axe scan of every page, with a shrinking allowlist               |
| `apps/web/e2e/screens.spec.ts`                          | Screenshots of every page at phone and desktop for visual review |
| `apps/web/src/shared/theme/theme.ts`                    | Theme constants, the no-flash script source, `applyTheme()`      |
| `apps/web/src/shared/theme/use-theme.ts`                | `useTheme()` hook                                                |
| `apps/web/src/shared/theme/theme-toggle.tsx`            | Header control: system / light / dark                            |
| `apps/web/src/shared/ui/select.tsx`                     | Native `<select>` styled like `Input`                            |
| `apps/web/src/shared/ui/icon-button.tsx`                | Square button with a required `label`                            |
| `apps/web/src/shared/ui/page-header.tsx`                | Page title, description and actions                              |
| `apps/web/src/shared/ui/skeleton.tsx`                   | Loading placeholder                                              |
| `apps/web/src/shared/ui/toast.tsx`                      | `ToastProvider`, `useToast()`                                    |
| `apps/web/src/shared/ui/confirm.tsx`                    | `ConfirmProvider`, `useConfirm()`                                |
| `apps/web/src/shared/ui/popover.tsx`                    | Radix Popover wrapper                                            |
| `apps/web/src/shared/ui/dropdown-menu.tsx`              | Radix DropdownMenu wrapper (items, checkbox items)               |
| `apps/web/src/shared/hooks/use-roving-focus.ts`         | Arrow-key focus movement for toolbars                            |
| `apps/web/src/app/(main)/nav-link.tsx`                  | Header link with `aria-current`                                  |
| `apps/web/src/features/track-view/shortcuts.ts`         | Pure key → action mapping                                        |
| `apps/web/src/features/track-view/shortcuts-dialog.tsx` | `?` help dialog                                                  |
| `apps/web/src/features/track-view/map-toolbar.tsx`      | The track view's bottom toolbar, extracted from the page         |

**Modify** (main ones): `src/app/globals.css`, `src/app/layout.tsx`, `src/app/providers.tsx`, `src/app/(main)/layout.tsx`, the three `(main)` pages, `src/shared/ui/{button,input,textarea,alert-dialog,osm-attribution}.tsx`, `src/features/tracks/track-list.tsx`, `src/features/backup/backup-panel.tsx`, `src/features/import/*.tsx`, `src/features/track-view/{track-view-page,track-view-shell,side-panel,corner-details,corner-guide-section,corner-markers,delete-track-button}.tsx`, `src/features/track-view/edit/{corner-guide-form,line-points,add-car-dialog}.tsx`, `src/features/practice/{practice-page,practice-card}.tsx`, `docs/adr/008-design-system.md` (new ADR), `docs/PLAN.md`.

---

## Phase 1 — Foundations

### Task 1: Accessibility and screenshot harness

**Files:**

- Create: `apps/web/e2e/a11y.spec.ts`, `apps/web/e2e/screens.spec.ts`
- Modify: `apps/web/package.json` (devDependency)

**Interfaces:**

- Produces: `KNOWN_VIOLATIONS: Record<PageKey, string[]>` in `a11y.spec.ts`. Later tasks delete entries from it; Task 15 asserts every list is empty.

- [ ] **Step 1: Install axe**

```bash
pnpm --filter web add -D @axe-core/playwright
```

- [ ] **Step 2: Write the a11y spec**

```ts
// apps/web/e2e/a11y.spec.ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type PageKey = "home-empty" | "home" | "backup" | "import" | "track" | "track-panel" | "practice";

/**
 * Rule ids that fail today, per page. Each UI task removes the ones it fixes;
 * the last task requires every list to be empty. Never add to this list.
 */
const KNOWN_VIOLATIONS: Record<PageKey, string[]> = {
  "home-empty": [],
  home: [],
  backup: [],
  import: [],
  track: [],
  "track-panel": [],
  practice: [],
};

async function scan(page: Page, key: PageKey) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const unexpected = violations.filter((v) => !KNOWN_VIOLATIONS[key].includes(v.id));
  expect(
    unexpected.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

async function loadSamples(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();
}

test("home (empty) is accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No tracks yet")).toBeVisible();
  await scan(page, "home-empty");
});

test("home (with tracks) is accessible", async ({ page }) => {
  await loadSamples(page);
  await scan(page, "home");
});

test("backup is accessible", async ({ page }) => {
  await page.goto("/backup/");
  await scan(page, "backup");
});

test("import is accessible", async ({ page }) => {
  await page.goto("/tracks/import/");
  await scan(page, "import");
});

test("track view is accessible", async ({ page }) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await expect(page.locator("[data-corner]").first()).toBeVisible();
  await scan(page, "track");
  await page.getByRole("button", { name: /^Turn 1,/ }).click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await scan(page, "track-panel");
});

test("practice is accessible", async ({ page }) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("link", { name: "Practice" }).click();
  await expect(page.getByTestId("practice-card")).toBeVisible();
  await scan(page, "practice");
});
```

- [ ] **Step 3: Write the screenshot spec**

```ts
// apps/web/e2e/screens.spec.ts
import { expect, test } from "@playwright/test";

// Not an assertion suite: run with SCREENS=1 to capture every surface for a
// human to compare before/after (test-results/ is gitignored).
test.skip(!process.env.SCREENS, "set SCREENS=1 to capture screenshots");

for (const scheme of ["light", "dark"] as const) {
  test(`screens (${scheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    const shot = (name: string) =>
      page.screenshot({ path: testInfo.outputPath(`${scheme}-${name}.png`), fullPage: true });

    await page.goto("/");
    await shot("home-empty");
    await page.getByRole("button", { name: "Load sample tracks" }).click();
    await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();
    await shot("home");
    await page.goto("/backup/");
    await shot("backup");
    await page.goto("/tracks/import/");
    await shot("import");
    await page.goto("/");
    await page.getByRole("link", { name: /Interlagos/ }).click();
    await expect(page.locator("[data-corner]").first()).toBeVisible();
    await shot("track");
    await page.getByRole("button", { name: /^Turn 1,/ }).click();
    await shot("track-panel");
    await page.getByRole("button", { name: "Edit" }).click();
    await shot("track-edit");
    await page.goto(page.url().replace("/tracks/view/", "/tracks/practice/"));
    await expect(page.getByTestId("practice-card")).toBeVisible();
    await shot("practice");
  });
}
```

- [ ] **Step 4: Run it and record today's violations**

Run: `pnpm --filter web build && pnpm --filter web exec playwright test e2e/a11y.spec.ts`
Expected: some tests FAIL listing rule ids (likely `target-size`, `color-contrast`, `region`). For each failing page, copy the rule ids into that page's `KNOWN_VIOLATIONS` list. Re-run until it passes on both projects (chromium and mobile). Write the final lists into the commit message body so the baseline is on record.

- [ ] **Step 5: Capture the "before" screenshots**

Run: `SCREENS=1 pnpm --filter web exec playwright test e2e/screens.spec.ts --output=test-results/screens-before`
Expected: PASS; PNGs under `apps/web/test-results/screens-before/`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/a11y.spec.ts apps/web/e2e/screens.spec.ts apps/web/package.json pnpm-lock.yaml
git commit -m "test(web): scan every page with axe and capture screenshots for UI review"
```

---

### Task 2: Tokens, base CSS and theme choice

**Files:**

- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/shared/theme/theme.ts`, `apps/web/src/shared/theme/use-theme.ts`, `apps/web/src/shared/theme/use-theme.test.ts`

**Interfaces:**

- Produces: `THEMES = ["system","light","dark"] as const`, `type Theme`, `THEME_KEY = "theme"`, `applyTheme(theme: Theme): void`, `themeScript: string`, `useTheme(): readonly [Theme, (t: Theme) => void]`.
- Produces CSS: tokens `--success`, `--estimate` (now defined for both schemes); utilities `focus-ring`, `pt-safe-<n>`, `pb-safe-<n>`, `pl-safe-<n>`, `pr-safe-<n>`.

- [ ] **Step 1: Write the failing hook test**

```ts
// apps/web/src/shared/theme/use-theme.test.ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, THEME_KEY } from "./theme";
import { useTheme } from "./use-theme";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe("applyTheme", () => {
  it("sets data-theme for an explicit choice and removes it for system", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe("useTheme", () => {
  it("defaults to system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");
  });

  it("stores the choice and applies it to the document", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]("light"));
    expect(result.current[0]).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("still switches when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]("dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test src/shared/theme`
Expected: FAIL — cannot resolve `./theme`.

- [ ] **Step 3: Implement theme module and hook**

```ts
// apps/web/src/shared/theme/theme.ts
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_KEY = "theme";

/** "system" leaves the attribute off, so the CSS follows prefers-color-scheme. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/**
 * Runs before first paint (inlined in <head>) so a stored choice never
 * flashes the other scheme. Must stay dependency-free and must not throw.
 */
export const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
```

```ts
// apps/web/src/shared/theme/use-theme.ts
"use client";

import { useEffect } from "react";
import { useStoredChoice } from "@/shared/hooks/use-stored-choice";
import { applyTheme, THEME_KEY, THEMES, type Theme } from "./theme";

export function useTheme() {
  const [theme, setTheme] = useStoredChoice<Theme>(THEME_KEY, THEMES, "system");
  useEffect(() => applyTheme(theme), [theme]);
  return [theme, setTheme] as const;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/shared/theme`
Expected: PASS (4 tests).

- [ ] **Step 5: Rewrite `globals.css`**

Replace the `:root` and `@media (prefers-color-scheme: dark)` blocks with `light-dark()` tokens (one definition per token, both schemes), keep the practice block and the `@theme inline` block, then add the base layer and utilities. Full file:

```css
@import "tailwindcss";

/* One definition per token: light-dark() picks by color-scheme, which follows
   the OS unless the theme toggle sets data-theme on <html>. */
:root {
  color-scheme: light dark;
  --background: light-dark(#ffffff, #0a0a0a);
  --foreground: light-dark(#171717, #ededed);
  --muted: light-dark(#5f6672, #a1a1aa);
  --border: light-dark(#e5e7eb, #27272a);
  --surface: light-dark(#f6f7f9, #141416);
  --accent: light-dark(#dc2626, #ef4444);
  --accent-foreground: light-dark(#ffffff, #0a0a0a);
  --danger: light-dark(#b91c1c, #f87171);
  --success: light-dark(#15803d, #4ade80);
  --estimate: light-dark(#a16207, #fbbf24);
  --canvas: light-dark(#eef0f3, #0d0f12);
  --track: light-dark(#3f444d, #4a505a);
  --track-edge: light-dark(#c9ced6, #22262c);
  --track-line: light-dark(#f5f5f5, #9aa1ab);
  --racing-line: light-dark(#2563eb, #60a5fa);
  --marker: light-dark(#111827, #f3f4f6);
  --marker-foreground: light-dark(#ffffff, #0a0a0a);
  --chip: light-dark(#ffffff, #1c1f24);
  --pressure: light-dark(#dc2626, #ef4444);
}
:root[data-theme="light"] {
  color-scheme: light;
}
:root[data-theme="dark"] {
  color-scheme: dark;
}

/* Practice mode: dark, high contrast, readable at a glance from the rig. */
[data-theme="practice"] {
  color-scheme: dark;
  --background: #000000;
  --foreground: #ffffff;
  --muted: #a3a3a3;
  --border: #2a2a2a;
  --surface: #121212;
  --accent: #f43f5e;
  --accent-foreground: #ffffff;
  --success: #4ade80;
  --track: #3a3d42;
  --track-edge: #1c1d20;
  --track-line: #8b8f96;
  --racing-line: #38bdf8;
  --pressure: #ef4444;
  --estimate: #fbbf24;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-border: var(--border);
  --color-surface: var(--surface);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-danger: var(--danger);
  --color-success: var(--success);
  --color-canvas: var(--canvas);
  --color-track: var(--track);
  --color-track-edge: var(--track-edge);
  --color-track-line: var(--track-line);
  --color-racing-line: var(--racing-line);
  --color-marker: var(--marker);
  --color-marker-foreground: var(--marker-foreground);
  --color-chip: var(--chip);
  /* shadcn/ui names, mapped onto our tokens. `accent` and `muted` are not
     aliased: ours mean brand red and a text color, shadcn's mean a hover
     background and a background. Adapt `shadcn add` output to use
     `hover:bg-surface` and `text-muted` instead. */
  --color-primary: var(--accent);
  --color-primary-foreground: var(--accent-foreground);
  --color-destructive: var(--danger);
  --color-input: var(--border);
  --color-ring: var(--accent);
  --color-pressure: var(--pressure);
  --color-estimate: var(--estimate);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@layer base {
  body {
    background: var(--background);
    color: var(--foreground);
  }
  /* Rows and buttons never flash the iOS tap highlight over our own states. */
  a,
  button,
  summary,
  select,
  input {
    -webkit-tap-highlight-color: transparent;
  }
}

/* The one focus style. Every interactive element uses this. */
@utility focus-ring {
  &:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
}

/* Spacing that also clears the notch / home indicator (needs viewport-fit=cover). */
@utility pt-safe-* {
  padding-top: calc(env(safe-area-inset-top) + var(--spacing) * --value(integer));
}
@utility pb-safe-* {
  padding-bottom: calc(env(safe-area-inset-bottom) + var(--spacing) * --value(integer));
}
@utility pl-safe-* {
  padding-left: calc(env(safe-area-inset-left) + var(--spacing) * --value(integer));
}
@utility pr-safe-* {
  padding-right: calc(env(safe-area-inset-right) + var(--spacing) * --value(integer));
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Note on values: `--muted` light moves `#6b7280 → #5f6672` and `--surface` `#f9fafb → #f6f7f9` so muted text on surface stays ≥ 4.5:1 (≈5.4:1). `--estimate` light is `#a16207` (≈4.9:1 on white) replacing the old `#b45309` fallback.

- [ ] **Step 6: Wire the no-flash script, `viewport-fit` and scheme-aware `theme-color` in the root layout**

First read `apps/web/node_modules/next/dist/docs/` for `generateViewport`/`viewport` (`themeColor` with `media`, `viewportFit`) and confirm that a raw `<script>` in the root layout's `<head>` is still allowed. Then:

```tsx
// apps/web/src/app/layout.tsx (changed parts)
import { themeScript } from "@/shared/theme/theme";

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The inline script sets data-theme before hydration.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Replace the raw amber classes in the estimate badge**

In `apps/web/src/features/track-view/corner-guide-section.tsx`, change the badge class to:

```tsx
<span className="rounded-full border border-estimate/50 bg-estimate/10 px-2.5 py-1 text-xs font-medium text-estimate">
```

In `apps/web/src/features/practice/practice-page.tsx` `WakeLockIndicator`, change `text-emerald-400` to `text-success`.

- [ ] **Step 8: Verify**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: all PASS. Then `pnpm --filter web exec playwright test e2e/a11y.spec.ts`; if `color-contrast` is now gone for a page, delete it from that page's `KNOWN_VIOLATIONS`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app apps/web/src/shared/theme apps/web/src/features/track-view/corner-guide-section.tsx apps/web/src/features/practice/practice-page.tsx apps/web/e2e/a11y.spec.ts
git commit -m "feat(web): token-based light/dark theme with a stored choice, safe-area and focus utilities"
```

---

### Task 3: Sized primitives and icons

**Files:**

- Modify: `apps/web/src/shared/ui/button.tsx`, `button.test.tsx`, `input.tsx`, `textarea.tsx`, `alert-dialog.tsx`, `osm-attribution.tsx`, `apps/web/package.json`
- Create: `apps/web/src/shared/ui/select.tsx`, `icon-button.tsx`, `icon-button.test.tsx`, `skeleton.tsx`

**Interfaces:**

- Produces: `Button` gains `size?: "sm" | "default" | "lg" | "icon"` and variants `ghost`, `secondary` (existing `default | outline | destructive` unchanged). `IconButton({ label, children, ...ButtonProps })` — renders `<Button size="icon" aria-label={label} title={label}>`. `Select(props: ComponentProps<"select">)`. `Skeleton({ className })`.

- [ ] **Step 1: Install icons**

```bash
pnpm --filter web add lucide-react
```

- [ ] **Step 2: Write failing tests**

Append to `apps/web/src/shared/ui/button.test.tsx`:

```tsx
it("is 40px tall by default and 44px on coarse pointers", () => {
  render(<Button>Save</Button>);
  const button = screen.getByRole("button", { name: "Save" });
  expect(button).toHaveClass("h-10");
  expect(button).toHaveClass("pointer-coarse:h-11");
});

it("renders the ghost variant", () => {
  render(<Button variant="ghost">More</Button>);
  expect(screen.getByRole("button", { name: "More" })).toHaveClass("hover:bg-surface");
});
```

```tsx
// apps/web/src/shared/ui/icon-button.test.tsx
import { render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import { describe, expect, it } from "vitest";
import { IconButton } from "./icon-button";

describe("IconButton", () => {
  it("is named by its label, square, and hides the icon from assistive tech", () => {
    render(
      <IconButton label="Close panel">
        <X />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Close panel" });
    expect(button).toHaveClass("size-10");
    expect(button).toHaveAttribute("title", "Close panel");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter web test src/shared/ui`
Expected: FAIL — `h-10` missing, `./icon-button` not found.

- [ ] **Step 4: Implement**

```tsx
// apps/web/src/shared/ui/button.tsx
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-foreground text-background hover:bg-foreground/90",
        outline: "border border-input bg-background hover:bg-surface",
        ghost: "hover:bg-surface",
        destructive: "bg-destructive text-background hover:bg-destructive/90",
      },
      size: {
        sm: "h-8 px-3 pointer-coarse:h-10",
        default: "h-10 px-4 pointer-coarse:h-11",
        lg: "h-11 px-5 text-base pointer-coarse:h-12",
        icon: "size-10 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

```tsx
// apps/web/src/shared/ui/icon-button.tsx
import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
} from "react";
import { Button } from "./button";

type IconButtonProps = Omit<ComponentProps<typeof Button>, "size" | "aria-label"> & {
  /** Accessible name and tooltip. Required: the button has no text. */
  label: string;
};

export function IconButton({ label, children, variant = "ghost", ...props }: IconButtonProps) {
  const icon = Children.map(children, (child) =>
    isValidElement(child)
      ? cloneElement(child as ReactElement<{ "aria-hidden"?: boolean }>, { "aria-hidden": true })
      : child,
  );
  return (
    <Button size="icon" variant={variant} aria-label={label} title={label} {...props}>
      {icon}
    </Button>
  );
}
```

```tsx
// apps/web/src/shared/ui/input.tsx — class only
"focus-ring h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base placeholder:text-muted disabled:opacity-50 aria-invalid:border-danger md:text-sm pointer-coarse:h-11",
```

```tsx
// apps/web/src/shared/ui/textarea.tsx — class only
"focus-ring flex min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base placeholder:text-muted disabled:opacity-50 aria-invalid:border-danger md:text-sm",
```

```tsx
// apps/web/src/shared/ui/select.tsx
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/** Native select (best on phones), styled like Input. */
function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "focus-ring h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base text-foreground disabled:opacity-50 md:text-sm pointer-coarse:h-11",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
```

```tsx
// apps/web/src/shared/ui/skeleton.tsx
import { cn } from "@/shared/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface", className)} />;
}
```

`alert-dialog.tsx`: content gets `p-6 space-y-4 rounded-2xl`, footer `gap-3`, and the overlay `bg-black/60 backdrop-blur-sm`. `osm-attribution.tsx`: `text-[11px]` → `text-xs`.

- [ ] **Step 5: Replace every `h-9` hand-rolled select/input with the primitives**

In `corner-guide-form.tsx`, `add-car-dialog.tsx`, `add-map-panel.tsx`, `known-facts-form.tsx`: swap raw `<select className="h-9 …">` for `<Select>` and drop duplicated classes. Keep `id`, `value`, `onChange`, `aria-*` unchanged.

- [ ] **Step 6: Verify**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS. Existing button tests still pass (`bg-primary`, `border-input`, `bg-destructive` classes kept).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/ui apps/web/src/features apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): 40/44px controls, 16px inputs on phones, icon button and select primitives"
```

---

## Phase 2 — App shell and standard pages

### Task 4: Shell with skip link, active nav, theme toggle and toasts

**Files:**

- Modify: `apps/web/src/app/(main)/layout.tsx`, `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/app/(main)/nav-link.tsx`, `apps/web/src/app/(main)/nav-link.test.tsx`, `apps/web/src/shared/theme/theme-toggle.tsx`, `apps/web/src/shared/theme/theme-toggle.test.tsx`, `apps/web/src/shared/ui/toast.tsx`, `apps/web/src/shared/ui/toast.test.tsx`, `apps/web/src/shared/ui/page-header.tsx`

**Interfaces:**

- Consumes: `useTheme()` (Task 2), `IconButton` (Task 3).
- Produces: `NavLink({ href, children })`; `ThemeToggle()`; `ToastProvider`, `useToast(): { show(message: string, tone?: "default" | "success" | "danger"): void }`; `PageHeader({ title, description?, actions? })`.

- [ ] **Step 1: Write failing tests**

```tsx
// apps/web/src/app/(main)/nav-link.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavLink } from "./nav-link";

vi.mock("next/navigation", () => ({ usePathname: () => "/backup/" }));

describe("NavLink", () => {
  it("marks the current page", () => {
    render(
      <>
        <NavLink href="/">Tracks</NavLink>
        <NavLink href="/backup/">Backup</NavLink>
      </>,
    );
    expect(screen.getByRole("link", { name: "Backup" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tracks" })).not.toHaveAttribute("aria-current");
  });
});
```

```tsx
// apps/web/src/shared/theme/theme-toggle.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle", () => {
  it("is a labelled radio group that applies the choice", async () => {
    render(<ThemeToggle />);
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
```

```tsx
// apps/web/src/shared/ui/toast.test.tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

function Trigger() {
  const toast = useToast();
  return <button onClick={() => toast.show("Backup downloaded.", "success")}>go</button>;
}

describe("toasts", () => {
  it("announces in a polite status region and disappears", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "go" }).click());
    expect(screen.getByRole("status")).toHaveTextContent("Backup downloaded.");
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test nav-link theme-toggle toast`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/app/(main)/nav-link.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  // "/" is current only on the home page; other links also own their sub-pages.
  const current = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="focus-ring inline-flex h-10 items-center rounded-lg px-3 text-muted hover:bg-surface hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:font-medium pointer-coarse:h-11"
    >
      {children}
    </Link>
  );
}
```

```tsx
// apps/web/src/shared/theme/theme-toggle.tsx
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./use-theme";
import type { Theme } from "./theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Three-way segmented control; native radios give arrow-key behavior for free. */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex rounded-lg border border-border p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <label
          key={value}
          title={label}
          className="relative grid size-9 cursor-pointer place-items-center rounded-md text-muted has-checked:bg-surface has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring pointer-coarse:size-10"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={theme === value}
            onChange={() => setTheme(value)}
            aria-label={label}
            className="sr-only"
          />
          <Icon aria-hidden className="size-4" />
        </label>
      ))}
    </div>
  );
}
```

```tsx
// apps/web/src/shared/ui/toast.tsx
"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Tone = "default" | "success" | "danger";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<{ show(message: string, tone?: Tone): void } | null>(null);
const DURATION = 4000;

/**
 * One message at a time in a polite live region that is always mounted (so
 * screen readers announce it). Bottom-center, above the safe area.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((message: string, tone: Tone = "default") => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-safe-4"
      >
        {toast && (
          <p
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm shadow-lg",
              toast.tone === "danger" && "border-danger/40",
            )}
          >
            {toast.tone === "success" && (
              <CheckCircle2 aria-hidden className="size-4 text-success" />
            )}
            {toast.tone === "danger" && <AlertCircle aria-hidden className="size-4 text-danger" />}
            {toast.message}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast needs a ToastProvider");
  return ctx;
}
```

```tsx
// apps/web/src/shared/ui/page-header.tsx
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-2xl/tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-prose text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
```

Add `<ToastProvider>` inside `Providers` around `RepositoriesProvider`'s children.

```tsx
// apps/web/src/app/(main)/layout.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/shared/theme/theme-toggle";
import { NavLink } from "./nav-link";

/** Standard pages: sticky header navigation and a centered content column. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="focus-ring sr-only z-50 rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 pt-safe-0 backdrop-blur">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2 text-sm pl-safe-4 pr-safe-4"
        >
          <Link href="/" className="focus-ring mr-3 rounded-lg font-semibold tracking-tight">
            Track Day
          </Link>
          <NavLink href="/">Tracks</NavLink>
          <NavLink href="/backup/">Backup</NavLink>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </nav>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 pt-8 pb-safe-12 outline-none pl-safe-4 pr-safe-4"
      >
        {children}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Use `PageHeader` on the three pages**

`(main)/page.tsx`: `<PageHeader title="Tracks" actions={<Button asChild variant="outline"><Link href="/tracks/import/"><Sparkles />Import with AI</Link></Button>} />` then `<TrackList />` (remove the duplicate "Import with AI" button at the top of `TrackList`'s non-empty branch). `(main)/backup/page.tsx`: `<PageHeader title="Backup" description="Your data lives only in this browser. Export regularly, and use the same file to move data to another device." />`. `(main)/tracks/import/page.tsx`: same pattern with its existing title and intro text. Drop the outer `space-y-6` wrappers — `main` now provides `gap-8`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS. Remove `region`/`bypass` and any other now-fixed ids from `KNOWN_VIOLATIONS` for home/backup/import.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src apps/web/e2e/a11y.spec.ts
git commit -m "feat(web): sticky header with skip link, active nav, theme toggle and toasts"
```

---

### Task 5: Track list as cards, with skeleton and search

**Files:**

- Modify: `apps/web/src/features/tracks/track-list.tsx`
- Create: `apps/web/src/features/tracks/track-list.test.tsx`, `apps/web/src/features/tracks/filter-tracks.ts`, `apps/web/src/features/tracks/filter-tracks.test.ts`

**Interfaces:**

- Consumes: `Skeleton`, `Input`, `useToast`.
- Produces: `filterTracks(tracks: Track[], query: string): Track[]`; `SEARCH_FROM = 6`.

- [ ] **Step 1: Write the failing filter test**

```ts
// apps/web/src/features/tracks/filter-tracks.test.ts
import { describe, expect, it } from "vitest";
import { filterTracks } from "./filter-tracks";

const t = (
  name: string,
  aliases: string[] = [],
  city: string | null = null,
  country: string | null = null,
) => ({ id: name, name, aliases, city, country }) as never;

describe("filterTracks", () => {
  const tracks = [
    t("Autódromo José Carlos Pace", ["Interlagos"], "São Paulo", "BR"),
    t("Suzuka International Racing Course", ["Suzuka"], "Suzuka", "JP"),
  ];

  it("returns everything for a blank query", () => {
    expect(filterTracks(tracks, "  ")).toHaveLength(2);
  });

  it("matches name, alias, city and country, ignoring case and accents", () => {
    expect(filterTracks(tracks, "interlagos")).toHaveLength(1);
    expect(filterTracks(tracks, "autodromo")).toHaveLength(1);
    expect(filterTracks(tracks, "sao paulo")).toHaveLength(1);
    expect(filterTracks(tracks, "jp")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test filter-tracks`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/tracks/filter-tracks.ts
import type { Track } from "@track-day/schema";

/** Show the search box from this many tracks. */
export const SEARCH_FROM = 6;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function filterTracks<T extends Pick<Track, "name" | "aliases" | "city" | "country">>(
  tracks: T[],
  query: string,
): T[] {
  const q = fold(query.trim());
  if (!q) return tracks;
  return tracks.filter((t) =>
    fold([t.name, ...t.aliases, t.city ?? "", t.country ?? ""].join(" ")).includes(q),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test filter-tracks`
Expected: PASS.

- [ ] **Step 5: Write the failing component test**

Same setup pattern as `backup-panel.test.tsx` (a stub repository passed to `RepositoriesProvider`):

```tsx
// apps/web/src/features/tracks/track-list.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { ToastProvider } from "@/shared/ui/toast";
import { TrackList } from "./track-list";

const track = (name: string, alias?: string) => ({
  id: name,
  name,
  aliases: alias ? [alias] : [],
  city: null,
  country: null,
});

function setup(list: () => Promise<unknown[]>) {
  const tracks = { list: vi.fn(list) };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{ tracks } as unknown as Repositories}>
        <ToastProvider>
          <TrackList />
        </ToastProvider>
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
}

const six = ["Suzuka", "Spa", "Monza", "Imola", "Fuji", "Laguna Seca"].map((n) => track(n));

describe("TrackList", () => {
  it("shows a busy skeleton list while loading", () => {
    setup(() => new Promise(() => {}));
    expect(screen.getByRole("list", { name: "Loading tracks" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("lists tracks as links whose names include the alias and the full name", async () => {
    setup(async () => [track("Autódromo José Carlos Pace", "Interlagos")]);
    const link = await screen.findByRole("link", { name: /Interlagos/ });
    expect(link).toHaveAccessibleName(/Autódromo José Carlos Pace/);
  });

  it("has no search box below six tracks", async () => {
    setup(async () => six.slice(0, 5));
    await screen.findAllByRole("link");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("offers search from six tracks and filters as you type", async () => {
    setup(async () => six);
    const search = await screen.findByRole("searchbox", { name: "Search tracks" });
    await userEvent.type(search, "suzu");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("says when nothing matches", async () => {
    setup(async () => six);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search tracks" }), "zzz");
    expect(screen.getByText("No tracks match “zzz”.")).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter web test track-list` — Expected: FAIL (no skeleton list, no search box).

- [ ] **Step 6: Implement the card list**

Replace the non-empty branch and loading branch of `TrackList`:

```tsx
if (isPending)
  return (
    <ul aria-label="Loading tracks" aria-busy="true" className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i}>
          <Skeleton className="h-20" />
        </li>
      ))}
    </ul>
  );
```

```tsx
const visible = filterTracks(tracks, query);
return (
  <div className="flex flex-col gap-4">
    {tracks.length >= SEARCH_FROM && (
      <div className="relative max-w-sm">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          aria-label="Search tracks"
          placeholder="Search by name, alias or place"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
    )}
    {visible.length === 0 ? (
      <p className="text-sm text-muted">No tracks match “{query.trim()}”.</p>
    ) : (
      <ul className="grid gap-3 sm:grid-cols-2">
        {visible.map((track) => (
          <li key={track.id}>
            <Link
              href={`/tracks/view/?track=${track.id}`}
              className="focus-ring group flex min-h-20 items-center gap-4 rounded-xl border border-border bg-background p-4 transition-colors hover:border-foreground/20 hover:bg-surface"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {track.aliases[0] ?? track.name}
                </span>
                <span className="block truncate text-sm text-muted">
                  {[track.aliases.length > 0 ? track.name : null, track.city, track.country]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    )}
  </div>
);
```

The link's accessible name still contains both the alias ("Interlagos") and the full name, so the e2e selectors `link /Interlagos/` and text "Autódromo José Carlos Pace" keep working. Empty state: wrap in `rounded-2xl border-dashed p-10`, add a `Flag` icon above the heading, keep the two buttons (give them icons `Sparkles` / `Download`), and on `loadSamples` success call `toast.show("Sample tracks loaded.", "success")`.

- [ ] **Step 7: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS (smoke, track-view and practice specs still find their links).

```bash
git add apps/web/src/features/tracks apps/web/src/app apps/web/e2e/a11y.spec.ts
git commit -m "feat(web): track cards with loading skeleton and search"
```

---

### Task 6: Backup and import pages

**Files:**

- Modify: `apps/web/src/features/backup/backup-panel.tsx`, `backup-panel.test.tsx`, `apps/web/src/features/import/track-import-page.tsx`, `paste-step.tsx`, `prompt-step.tsx`, `known-facts-form.tsx`, `track-preview.tsx`

**Interfaces:**

- Consumes: `useToast`, `Button`, `Select`.

- [ ] **Step 1: Write failing backup tests**

Add to `backup-panel.test.tsx` (reuse its existing render/seed helpers):

```tsx
it("offers import modes as large radio cards inside a named group", () => {
  setup();
  const group = screen.getByRole("radiogroup", { name: "Import mode" });
  expect(within(group).getByRole("radio", { name: /Merge/ })).toBeChecked();
  expect(within(group).getByRole("radio", { name: /Replace/ })).not.toBeChecked();
});

it("warns before a replace import with a visible note", async () => {
  setup();
  await userEvent.click(screen.getByRole("radio", { name: /Replace/ }));
  expect(screen.getByText(/deletes everything in this browser first/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test backup-panel`
Expected: FAIL — no radiogroup role (it's a `fieldset` with `sr-only` legend).

- [ ] **Step 3: Implement**

Layout: two cards side by side from `md` (`grid gap-4 md:grid-cols-2`), each `rounded-2xl border border-border p-6 flex flex-col gap-4`, headings `text-lg font-semibold` with a `Download` / `Upload` icon.

Modes:

```tsx
<div role="radiogroup" aria-label="Import mode" className="grid gap-2">
  {(
    [
      ["merge", "Merge", "Keep local data; the most recently edited version of each record wins."],
      ["replace", "Replace", "Delete all local data first."],
    ] as const
  ).map(([value, title, hint]) => (
    <label
      key={value}
      className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 has-checked:border-accent has-checked:bg-accent/5 has-focus-visible:outline-2 has-focus-visible:outline-ring"
    >
      <input
        type="radio"
        name="mode"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span className="text-sm">
        <span className="block font-medium">{title}</span>
        <span className="text-muted">{hint}</span>
      </span>
    </label>
  ))}
</div>;
{
  mode === "replace" && (
    <p className="flex gap-2 text-sm text-danger">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      Replace deletes everything in this browser first. Export a backup before you continue.
    </p>
  );
}
```

File input: keep the `<input type="file" id={fileInputId}>` and its `<label>` text "Backup file" (e2e uses `getByLabel("Backup file")`), styled with `file:h-10 file:rounded-lg file:border file:border-border file:bg-background file:px-4 file:font-medium`.

Status: after export, `toast.show("Backup downloaded.", "success")`; after import, `toast.show(message, "success")` and keep the inline `<p>` (e2e checks `/imported/` text) styled `flex items-center gap-2 text-success` with a `CheckCircle2` icon.

Import page: render steps as a numbered list — each `Step` gets a circular number badge (`grid size-8 place-items-center rounded-full bg-foreground text-background text-sm font-semibold`) next to its `h2`, a left rule connecting steps (`border-l border-border ml-4 pl-8` on the content), and `gap-10` between steps. The `h2` text stays "1. Get the prompt" etc. minus the number prefix, with the number in the badge marked `aria-hidden` and the `h2` getting `aria-label="Step 1: Get the prompt"`. Check `e2e/import.spec.ts` for heading-name selectors and update them in the same commit if they match the old text. In `prompt-step.tsx` replace the `<details>` with a `Button variant="ghost"` toggling `aria-expanded` + a region (`id` + `aria-controls`). Copy button shows a `Check` icon for 2 s after copying (`aria-live` text "Copied" stays).

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS. Clear fixed ids from `KNOWN_VIOLATIONS.backup` and `.import`.

```bash
git add apps/web/src/features/backup apps/web/src/features/import apps/web/e2e
git commit -m "feat(web): card layout for backup and a numbered stepper for import"
```

---

## Phase 3 — Track view

### Task 7: Dropdown menu and popover primitives, roving toolbar focus

**Files:**

- Create: `apps/web/src/shared/ui/dropdown-menu.tsx`, `apps/web/src/shared/ui/popover.tsx`, `apps/web/src/shared/hooks/use-roving-focus.ts`, `apps/web/src/shared/hooks/use-roving-focus.test.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**

- Produces: `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel`; `Popover, PopoverTrigger, PopoverContent`; `useRovingFocus<T extends HTMLElement>(): { ref: RefObject<T | null>; onKeyDown(e: React.KeyboardEvent): void }`.

- [ ] **Step 1: Install**

```bash
pnpm --filter web add @radix-ui/react-dropdown-menu @radix-ui/react-popover
```

- [ ] **Step 2: Write the failing roving-focus test**

```tsx
// apps/web/src/shared/hooks/use-roving-focus.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useRovingFocus } from "./use-roving-focus";

function Bar() {
  const { ref, onKeyDown } = useRovingFocus<HTMLDivElement>();
  return (
    <div role="toolbar" aria-label="Map controls" ref={ref} onKeyDown={onKeyDown}>
      <button>A</button>
      <button disabled>B</button>
      <button>C</button>
      <select aria-label="Car">
        <option>x</option>
      </select>
    </div>
  );
}

describe("useRovingFocus", () => {
  it("moves with arrows, skips disabled, wraps, and supports Home/End", async () => {
    render(<Bar />);
    screen.getByRole("button", { name: "A" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "C" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("combobox", { name: "Car" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "A" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("combobox", { name: "Car" })).toHaveFocus();
  });

  it("leaves arrow keys to a focused select", async () => {
    render(<Bar />);
    screen.getByRole("combobox", { name: "Car" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("combobox", { name: "Car" })).toHaveFocus();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter web test use-roving-focus`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// apps/web/src/shared/hooks/use-roving-focus.ts
import { useCallback, useRef, type KeyboardEvent } from "react";

const FOCUSABLE = "button:not([disabled]), a[href], select:not([disabled]), input:not([disabled])";

/**
 * Toolbar keyboard contract (WAI-ARIA APG): Left/Right move between
 * controls, Home/End jump, wrapping at the ends. Up/Down are left alone so a
 * focused <select> keeps working. Tab still enters and leaves normally.
 */
export function useRovingFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    e.preventDefault();
    items[next]?.focus();
  }, []);
  return { ref, onKeyDown };
}
```

```tsx
// apps/web/src/shared/ui/popover.tsx
"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 w-72 rounded-xl border border-border bg-background p-3 text-foreground shadow-xl outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
```

```tsx
// apps/web/src/shared/ui/dropdown-menu.tsx
"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 min-w-48 rounded-xl border border-border bg-background p-1 text-sm shadow-xl",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const item =
  "flex h-10 cursor-default items-center gap-2 rounded-lg px-3 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-surface pointer-coarse:h-11 [&_svg]:size-4";

function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(item, className)} {...props} />;
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(item, "pl-9 relative", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-3">
        <Check aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}

function DropdownMenuSeparator(props: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className="my-1 h-px bg-border" {...props} />;
}

function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn("px-3 py-1.5 text-xs font-medium text-muted", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

```bash
git add apps/web/src/shared apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): dropdown menu and popover primitives, roving focus for toolbars"
```

---

### Task 8: Track view top bar and one-row toolbar

**Files:**

- Create: `apps/web/src/features/track-view/map-toolbar.tsx`, `apps/web/src/features/track-view/map-toolbar.test.tsx`
- Modify: `apps/web/src/features/track-view/track-view-shell.tsx`, `track-view-page.tsx`, `delete-track-button.tsx`, `apps/web/e2e/track-view.spec.ts`

**Interfaces:**

- Consumes: `useRovingFocus`, `DropdownMenu*`, `IconButton`, `Select`, `Button`.
- Produces:

```ts
interface MapToolbarProps {
  hasMap: boolean; // false for NoOutline layouts: only Edit, car, Corners
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  chips: { on: boolean; disabled: boolean; toggle(): void };
  racingLine: { on: boolean; disabled: boolean; toggle(): void };
  editing: boolean;
  onToggleEdit(): void;
  carPicker: ReactNode; // the existing <select aria-label="Car">, now a <Select>
  listOpen: boolean;
  onToggleList(): void;
  redoMap: { available: boolean; active: boolean; open(): void };
}
export function MapToolbar(props: MapToolbarProps): JSX.Element;
```

`ToolButton` stays exported from `track-view-shell.tsx` (other code may import it) but becomes `h-10 pointer-coarse:h-11 px-3 rounded-lg focus-ring`.

- [ ] **Step 1: Write the failing toolbar test**

```tsx
// apps/web/src/features/track-view/map-toolbar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapToolbar } from "./map-toolbar";

const props = () => ({
  hasMap: true,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onReset: vi.fn(),
  chips: { on: true, disabled: false, toggle: vi.fn() },
  racingLine: { on: false, disabled: false, toggle: vi.fn() },
  editing: false,
  onToggleEdit: vi.fn(),
  carPicker: (
    <select aria-label="Car">
      <option>Miata</option>
    </select>
  ),
  listOpen: false,
  onToggleList: vi.fn(),
  redoMap: { available: true, active: false, open: vi.fn() },
});

describe("MapToolbar", () => {
  it("keeps the names e2e relies on", () => {
    render(<MapToolbar {...props()} />);
    for (const name of ["Zoom in", "Zoom out", "Edit", "Corners"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Map controls" })).toBeInTheDocument();
  });

  it("puts the layer toggles in a Layers menu as checkboxes", async () => {
    const p = props();
    render(<MapToolbar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Speed & gear" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Racing line" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Racing line" }));
    expect(p.racingLine.toggle).toHaveBeenCalled();
  });

  it("puts Reset view and Redo map in the More menu", async () => {
    const p = props();
    render(<MapToolbar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reset view" }));
    expect(p.onReset).toHaveBeenCalled();
  });

  it("shows only Edit, car and Corners without a map", () => {
    render(<MapToolbar {...props()} hasMap={false} />);
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Layers" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test map-toolbar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MapToolbar`**

```tsx
// apps/web/src/features/track-view/map-toolbar.tsx
"use client";

import {
  Layers,
  List,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Map as MapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRovingFocus } from "@/shared/hooks/use-roving-focus";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { IconButton } from "@/shared/ui/icon-button";
import { ToolButton } from "./track-view-shell";

export interface MapToolbarProps {
  /* exactly as in Interfaces above */
}

const Divider = () => <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;

/** One row, never wrapping: secondary actions live in the two menus. */
export function MapToolbar(p: MapToolbarProps) {
  const { ref, onKeyDown } = useRovingFocus<HTMLDivElement>();
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Map controls"
      onKeyDown={onKeyDown}
      className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-background/90 p-1 shadow-lg backdrop-blur [scrollbar-width:none]"
    >
      {p.hasMap && (
        <>
          <IconButton label="Zoom in" onClick={p.onZoomIn}>
            <Plus />
          </IconButton>
          <IconButton label="Zoom out" onClick={p.onZoomOut}>
            <Minus />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Layers">
                <Layers />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuCheckboxItem
                checked={p.chips.on}
                disabled={p.chips.disabled}
                onCheckedChange={p.chips.toggle}
              >
                Speed &amp; gear
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={p.racingLine.on}
                disabled={p.racingLine.disabled}
                onCheckedChange={p.racingLine.toggle}
              >
                Racing line
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Divider />
        </>
      )}
      {p.carPicker}
      <ToolButton pressed={p.editing} onClick={p.onToggleEdit}>
        <Pencil aria-hidden className="size-4" />
        Edit
      </ToolButton>
      <ToolButton pressed={p.listOpen} onClick={p.onToggleList}>
        <List aria-hidden className="size-4" />
        Corners
      </ToolButton>
      {p.hasMap && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More map actions">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end">
            <DropdownMenuItem onSelect={p.onReset}>
              <RotateCcw aria-hidden />
              Reset view
            </DropdownMenuItem>
            {p.redoMap.available && (
              <DropdownMenuItem onSelect={p.redoMap.open}>
                <MapIcon aria-hidden />
                Redo map
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
```

On phones the "Edit" and "Corners" text labels hide below `sm` (`<span className="max-sm:sr-only">Edit</span>`) so the row fits at 360 px; the accessible name is unchanged.

- [ ] **Step 4: Rework the shell and top bar**

`TrackViewShell`: the header becomes `pt-safe-3 pl-safe-3 pr-safe-3 px-3` and the top-bar pill `flex h-14 items-center gap-2 rounded-2xl px-2 shadow-lg`; the bottom wrapper `pb-safe-3 pl-safe-3 pr-safe-3` and renders `controls` directly (the toolbar now owns its own `role="toolbar"` container — remove the one in the shell). Top bar contents, left to right:

- `IconButton label="Back to tracks"` with `ArrowLeft` (keep `onClick={guardLink}` by wrapping a `Link` via `Button asChild size="icon" variant="ghost"` — the link's name becomes "Back to tracks"; update the e2e selector `link "← Tracks"` if any spec uses it).
- `h1` `text-sm font-semibold truncate max-w-[40vw]`.
- Layout `<Select aria-label="Layout" className="h-9 w-auto">` when there are several layouts.
- `Button asChild size="sm" variant="secondary"` wrapping the Practice `Link` with a `Play` icon — the link text stays exactly "Practice".
- `DeleteTrackButton` trigger becomes `IconButton label="Delete track" variant="ghost"` with `Trash2`, `className="text-muted hover:text-danger"`. Check `e2e/*.spec.ts` for `name: "Delete"` and change to `"Delete track"` — note the dialog's confirm button is also "Delete track", so in specs scope the confirm click to `page.getByRole("alertdialog")`.

In `track-view-page.tsx`, replace the inline controls with `<MapToolbar …/>` for both the outline and no-outline branches (`hasMap={false}` for the latter), and the car `<select>` with `<Select aria-label="Car" className="h-10 w-auto max-w-44 pointer-coarse:h-11">`.

- [ ] **Step 5: Add an e2e check that the toolbar is one row on a 360 px phone and clears the safe area**

In `apps/web/e2e/track-view.spec.ts`:

```ts
test("the map toolbar stays one row on a small phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.setViewportSize({ width: 360, height: 740 });
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  const bar = page.getByRole("toolbar", { name: "Map controls" });
  const box = (await bar.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(56);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});
```

Update existing specs that click "Reset view", "Speed & gear", "Racing line" or "Redo map" to open the menu first (`getByRole("button", { name: "Layers" })` / `"More map actions"`) and then click the `menuitemcheckbox` / `menuitem`. Also add: open Layers, press Escape → menu closes and the side panel (if open) stays open.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS. Remove fixed ids (`target-size`, …) from `KNOWN_VIOLATIONS.track`.

```bash
git add apps/web/src/features/track-view apps/web/e2e
git commit -m "feat(web): one-row map toolbar with layer and overflow menus, icon top bar"
```

---

### Task 9: Side panel, corner details and markers

**Files:**

- Modify: `apps/web/src/features/track-view/side-panel.tsx`, `side-panel.test.tsx`, `corner-details.tsx`, `corner-guide-section.tsx`, `corner-markers.tsx`, `corner-markers.test.tsx`

**Interfaces:**

- Produces: `SidePanel` gains optional `headerActions?: ReactNode` (rendered between title and close). Bottom sheet gains an "Expand panel"/"Collapse panel" `IconButton` with `aria-expanded`, toggling `max-h-[45dvh]` ↔ `max-h-[85dvh]` below `md`.

- [ ] **Step 1: Write failing tests**

Add to `side-panel.test.tsx`:

```tsx
it("has a 40px close button with an icon", () => {
  render(
    <SidePanel open title="Corners" onClose={() => {}}>
      x
    </SidePanel>,
  );
  const close = screen.getByRole("button", { name: "Close panel" });
  expect(close).toHaveClass("size-10");
  expect(close.querySelector("svg")).not.toBeNull();
});

it("expands and collapses the sheet", async () => {
  render(
    <SidePanel open title="Corners" onClose={() => {}}>
      x
    </SidePanel>,
  );
  const toggle = screen.getByRole("button", { name: "Expand panel" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Collapse panel" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});
```

Add to `corner-markers.test.tsx` (uses its `renderMarkers` and `corner` helpers):

```tsx
it("gives each marker a 44px hit area around a 28px badge", () => {
  renderMarkers([corner(1)]);
  const marker = screen.getByRole("button", { name: /^Turn 1/ });
  expect(marker).toHaveClass("before:size-11");
  expect(marker.querySelector("span")).toHaveClass("size-7");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test side-panel corner-markers`
Expected: FAIL.

- [ ] **Step 3: Implement**

`side-panel.tsx`:

- Container: `pb-safe-0` on the sheet; desktop `md:top-20 md:w-[400px]`. Header `sticky top-0 flex items-center gap-2 border-b border-border px-4 py-2` with title `flex-1 truncate text-base font-semibold`.
- Close: `<IconButton label="Close panel" onClick={onClose}><X /></IconButton>`.
- Sheet toggle (visible `md:hidden`): `<IconButton label={expanded ? "Collapse panel" : "Expand panel"} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? <ChevronDown/> : <ChevronUp/>}</IconButton>`. The grab handle stays decorative.
- Body: `px-4 py-4 pb-safe-4`.

`corner-details.tsx`:

- Facts grid stays 2 columns; `dt` `text-xs font-medium text-muted uppercase tracking-wide`, `dd` `mt-0.5 font-medium`.
- "Practice from Tn" uses `Button asChild variant="secondary" className="w-full"` with `Play` icon.
- Prev/next nav: two `Button variant="outline" className="flex-1"` with `ChevronLeft`/`ChevronRight` icons and text `T{n}` — accessible names `Previous corner, T{n}` / `Next corner, T{n}` via `aria-label`. Check e2e for `← T` / `T… →` selectors and update.
- `CornerList` rows: `h-11 gap-3 rounded-lg px-2 focus-ring`, badge `size-7`.
- Sections (`Part of …`, Notes, Common mistakes) get `space-y-2`, headings `text-sm font-semibold`.

`corner-guide-section.tsx`: values grid `gap-x-4 gap-y-3`, `dd` `text-base font-semibold tabular-nums`.

`corner-markers.tsx`:

- `BADGE = 28`. Button classes add `before:absolute before:top-1/2 before:left-[14px] before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:content-['']` (invisible 44 px target centred on the badge).
- Badge span: `size-7` and `motion-safe:transition-transform motion-safe:group-hover:scale-110`; selected keeps `scale-110` only under `motion-safe:`.
- Chip: `text-[11px]` → `text-xs`; `CHIP_CHAR` `6.1 → 6.6` so placement estimates match the larger text.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS, including `expectAllMarkersInViewport` (labels are 2 px larger; if it fails, it is the `edge` margin — raise `edge` from 6 to 8, don't loosen the test). Clear fixed ids from `KNOWN_VIOLATIONS["track-panel"]`.

```bash
git add apps/web/src/features/track-view apps/web/e2e
git commit -m "feat(web): roomier side panel with expandable sheet, 44px corner marker targets"
```

---

### Task 10: Styled confirm dialog replaces `window.confirm`

**Files:**

- Create: `apps/web/src/shared/ui/confirm.tsx`, `apps/web/src/shared/ui/confirm.test.tsx`
- Modify: `apps/web/src/app/providers.tsx`, `apps/web/src/features/track-view/track-view-page.tsx`, `track-view-page.test.tsx`, `apps/web/src/features/track-view/edit/line-points.tsx`, `line-points.test.tsx`, `apps/web/e2e/editing.spec.ts`

**Interfaces:**

- Produces:

```ts
interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string; // e.g. "Discard changes"
  cancelLabel?: string; // default "Cancel"
  destructive?: boolean;
}
function useConfirm(): (options: ConfirmOptions) => Promise<boolean>;
```

- Changes in `TrackView`: `leaveEdits(): Promise<boolean>`; `guardLink` always `preventDefault()`s when dirty, then `router.push(href)` after a yes.

- [ ] **Step 1: Write the failing hook test**

```tsx
// apps/web/src/shared/ui/confirm.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConfirmProvider, useConfirm } from "./confirm";

function Probe({ onResult }: { onResult(v: boolean): void }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () =>
        onResult(
          await confirm({
            title: "Discard unsaved changes?",
            confirmLabel: "Discard changes",
            cancelLabel: "Keep editing",
            destructive: true,
          }),
        )
      }
    >
      leave
    </button>
  );
}

describe("useConfirm", () => {
  it("resolves true on confirm", async () => {
    let result: boolean | undefined;
    render(
      <ConfirmProvider>
        <Probe onResult={(v) => (result = v)} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(result).toBe(true);
  });

  it("resolves false on cancel and on Escape, and returns focus", async () => {
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Probe onResult={(v) => results.push(v)} />
      </ConfirmProvider>,
    );
    const trigger = screen.getByRole("button", { name: "leave" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(results).toEqual([false, false]);
    expect(trigger).toHaveFocus();
  });

  it("focuses the safe choice first", async () => {
    render(
      <ConfirmProvider>
        <Probe onResult={() => {}} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test confirm`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/shared/ui/confirm.tsx
"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Ask | null>(null);

/** Promise-based replacement for window.confirm, styled like the app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>(undefined);

  const ask = useCallback<Ask>((next) => {
    resolver.current?.(false); // a second ask cancels the first
    setOptions(next);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        {options && (
          <AlertDialogContent>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description && (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="outline" autoFocus>
                  {options.cancelLabel ?? "Cancel"}
                </Button>
              </AlertDialogCancel>
              <Button
                variant={options.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {options.confirmLabel}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm needs a ConfirmProvider");
  return ask;
}
```

Add `<ConfirmProvider>` in `Providers` (inside `ToastProvider`). Test renders of components that call `useConfirm` need the provider: add it to the render helper in `apps/web/src/test/dom.ts`.

- [ ] **Step 4: Convert the track view**

```tsx
const confirm = useConfirm();
const DISCARD = {
  title: "Discard unsaved changes?",
  description: "Your edits to this corner haven’t been saved.",
  confirmLabel: "Discard changes",
  cancelLabel: "Keep editing",
  destructive: true,
} as const;

const confirmDiscard = async () =>
  !Object.values(dirtyRef.current).some(Boolean) || confirm(DISCARD);

/** Asks before dropping unsaved edits; on yes, clears the edit state. */
const leaveEdits = async () => {
  if (!(await confirmDiscard())) return false;
  setDirty({});
  setPicking(null);
  setPickError(null);
  return true;
};

/** Links: navigate immediately when clean; otherwise ask, then navigate. */
const guardLink = (e: React.MouseEvent<HTMLAnchorElement>) => {
  if (!Object.values(dirtyRef.current).some(Boolean)) return;
  e.preventDefault();
  const href = e.currentTarget.getAttribute("href")!;
  void leaveEdits().then((ok) => ok && router.push(href));
};
```

Every caller becomes `void leaveEdits().then((ok) => ok && …)`. For the layout and car `<select>`s, the select is controlled by URL params, so a "Keep editing" answer leaves the old value displayed without extra work. `"__add__"` in the car picker: `void confirmDiscard().then((ok) => ok && setAddingCar(true))`.

`line-points.tsx`: replace `!window.confirm(\`This is ${meters} m …\`)` with

```ts
!(await confirm({
  title: `Place the ${NAMES[point]} ${meters} m from the corner?`,
  description: "That’s far from where this corner is on the map.",
  confirmLabel: "Place it here",
  cancelLabel: "Cancel",
}));
```

(`useLinePointPick` already returns an async function; take `confirm` from `useConfirm()` in the hook.)

- [ ] **Step 5: Update tests**

In `track-view-page.test.tsx`:

1. Hoist the router mock so tests can assert on `push`, and wrap the page in `ConfirmProvider`:

```tsx
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace, push }),
  usePathname: () => "/tracks/view/",
}));
// in open(): <RepositoriesProvider repositories={repos}><ConfirmProvider><TrackViewPage /></ConfirmProvider></RepositoriesProvider>
```

Add `push.mockClear()` to `beforeEach`.

2. Replace the two `window.confirm` tests ("asks before leaving a corner…" and "asks before opening Add car…") with:

```tsx
const discardDialog = () => screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });

it("does not ask when nothing is dirty", async () => {
  const { t1, t2 } = await open({ edit: "1" });
  search.set("corner", t1.id);
  rerenderPage();
  // fireEvent: user-event's mousedown has no `view`, which d3-zoom chokes on.
  fireEvent.click(await screen.findByRole("button", { name: /^Turn 2,/ }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(search.get("corner")).toBe(t2.id);
});

it("keeps the edits and the corner on Keep editing", async () => {
  const { t1, user } = await open({ edit: "1" });
  search.set("corner", t1.id);
  rerenderPage();
  await user.type(await screen.findByLabelText("Corner notes"), "x");
  fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
  await discardDialog();
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(search.get("corner")).toBe(t1.id);
  expect(screen.getByLabelText("Corner notes")).toHaveValue(expect.stringMatching(/x$/));
});

it("moves on after Discard changes", async () => {
  const { t1, t2, user } = await open({ edit: "1" });
  search.set("corner", t1.id);
  rerenderPage();
  await user.type(await screen.findByLabelText("Corner notes"), "x");
  fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
  await user.click(within(await discardDialog()).getByRole("button", { name: "Discard changes" }));
  await waitFor(() => expect(search.get("corner")).toBe(t2.id));
});

it("asks before opening Add car over unsaved edits", async () => {
  const { t1, user } = await open({ edit: "1" });
  search.set("corner", t1.id);
  rerenderPage();
  await user.type(await screen.findByLabelText("Corner notes"), "x");
  await user.selectOptions(screen.getByLabelText("Car"), "__add__");
  await user.click(within(await discardDialog()).getByRole("button", { name: "Keep editing" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Car"), "__add__");
  await user.click(within(await discardDialog()).getByRole("button", { name: "Discard changes" }));
  expect(await screen.findByRole("alertdialog", { name: /Add a car/i })).toBeInTheDocument();
});

it("asks before following the back link, and navigates only on Discard changes", async () => {
  const { t1, user } = await open({ edit: "1" });
  search.set("corner", t1.id);
  rerenderPage();
  await user.type(await screen.findByLabelText("Corner notes"), "x");
  await user.click(screen.getByRole("link", { name: "Back to tracks" }));
  await discardDialog();
  expect(push).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
});

it("closes only the dialog on Escape, leaving the panel open", async () => {
  const { t1, user } = await open({ edit: "1" });
  search.set("corner", t1.id);
  rerenderPage();
  await user.type(await screen.findByLabelText("Corner notes"), "x");
  fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
  await discardDialog();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByTestId("side-panel")).toBeInTheDocument();
  expect(search.get("corner")).toBe(t1.id);
});
```

Check the Add-car dialog's real title in `add-car-dialog.tsx` and use it in the `/Add a car/i` matcher. For the Escape test: `SidePanel`'s Escape listener skips `defaultPrevented` events and Radix's dialog prevents default on Escape — if the panel still closes, the fix belongs in `SidePanel` (skip when `document.querySelector("[role=alertdialog]")` exists), not in the test.

3. In "cancels a pick on Escape without closing the panel", drop the `window.confirm` spy and assert `screen.queryByRole("alertdialog")` is absent instead.

4. In `line-points.test.tsx`, replace the confirm spy for a far pick with: the "Place the apex … m from the corner?" alertdialog appears; "Cancel" saves nothing; "Place it here" saves.

5. In `e2e/editing.spec.ts`, replace `page.on("dialog", …)` handlers with clicks on "Discard changes" / "Keep editing" / "Place it here" inside `page.getByRole("alertdialog")`.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS. `grep -rn "window.confirm" apps/web/src` returns nothing.

```bash
git add apps/web/src apps/web/e2e
git commit -m "feat(web): confirm unsaved-edit and far line-point actions in an app dialog"
```

---

### Task 11: Corner guide form layout and save bar

**Files:**

- Modify: `apps/web/src/features/track-view/edit/corner-guide-form.tsx`, `corner-guide-form.test.tsx`, `corner-notes-form.tsx`, `corner-notes-form.test.tsx`
- Modify: `apps/web/src/shared/ui/input.tsx` (suffix support)

**Interfaces:**

- Produces: `Input` gains optional `suffix?: string`, drawn inside the input's right edge (`aria-hidden`). The unit reaches assistive tech through the label instead: `field("entrySpeedKmh", "Entry", { hidden: " speed (km/h)", unit: "km/h" })` renders `<Label>Entry<span className="sr-only"> speed (km/h)</span></Label>` plus `<Input suffix="km/h">`. The accessible name stays "Entry speed (km/h)", so existing tests that query by label keep passing.

Labels (visible → accessible name, which must equal today's label text):

| Visible   | Accessible name (unchanged) | Suffix |
| --------- | --------------------------- | ------ |
| Entry     | Entry speed (km/h)          | km/h   |
| Minimum   | Minimum speed (km/h)        | km/h   |
| Exit      | Exit speed (km/h)           | km/h   |
| Gear      | Gear                        | —      |
| Downshift | Downshift to                | —      |
| Board     | Brake board (m)             | m      |
| Pressure  | Pressure (%)                | %      |

- [ ] **Step 1: Write failing tests**

Add to `corner-guide-form.test.tsx` (its `setup()` stubs `cornerGuides.create`/`update`):

```tsx
it("keeps field names but shows short labels with unit suffixes", () => {
  setup();
  const entry = screen.getByLabelText("Entry speed (km/h)");
  expect(entry.parentElement).toHaveTextContent("km/h");
  expect(screen.getByText("Entry", { selector: "label" })).toBeVisible();
});

it("lays numeric fields out in two columns", () => {
  setup();
  const grid = screen.getByLabelText("Entry speed (km/h)").closest("[data-slot=field-grid]");
  expect(grid).toHaveClass("grid-cols-2");
});

it("saves with Ctrl/Cmd+Enter from any field", async () => {
  const { create, user } = setup();
  await user.type(screen.getByLabelText("Gear"), "3");
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ gear: 3 }));
});

it("shows Unsaved changes in the save bar only when dirty", async () => {
  const { user } = setup();
  expect(screen.queryByText("Unsaved changes")).toBeNull();
  await user.type(screen.getByLabelText("Gear"), "3");
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test corner-guide-form`
Expected: FAIL.

- [ ] **Step 3: Implement**

`Input` with suffix:

```tsx
function Input({ className, suffix, ...props }: ComponentProps<"input"> & { suffix?: string }) {
  const input = (
    <input
      data-slot="input"
      className={cn(
        "focus-ring h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base placeholder:text-muted disabled:opacity-50 aria-invalid:border-danger md:text-sm pointer-coarse:h-11",
        suffix && "pr-12",
        className,
      )}
      {...props}
    />
  );
  if (!suffix) return input;
  return (
    <div className="relative">
      {input}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
      >
        {suffix}
      </span>
    </div>
  );
}
```

Form:

- `field(name, visible, { hidden, unit, kind })` renders `<Label htmlFor=…>{visible}{hidden && <span className="sr-only">{hidden}</span>}</Label>` — e.g. `field("entrySpeedKmh", "Entry", { hidden: " speed (km/h)", unit: "km/h" })`. Double-check each accessible name in the table above with `getByLabelText` in the tests.
- Group into fieldsets with visible legends: **Speeds** (Entry, Minimum, Exit), **Gears** (Gear, Downshift), **Braking** (Board, Brake reference full width, Brake pressure, Pressure), **Line** (children: line points), **Cue**, **Notes**. Each `fieldset` `space-y-3`, legend `text-xs font-semibold uppercase tracking-wide text-muted`; numeric grids `data-slot="field-grid" grid grid-cols-2 gap-3` everywhere (Speeds' third field wraps to a second row; no breakpoint variants).
- Error text `text-xs text-danger` keeps its `id` and `aria-describedby`.
- Save bar: `sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur` containing `{dirty && <span className="text-sm text-muted">Unsaved changes</span>}` and the existing Save button (`className="ml-auto"`); keep the existing `aria-live` saved/error messages in it.
- `onKeyDown` on the `<form>`: `if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }`.

Apply the same save bar and Ctrl/Cmd+Enter to `corner-notes-form.tsx`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS (editing e2e still finds fields by their unchanged names).

```bash
git add apps/web/src
git commit -m "feat(web): two-column guide form with unit suffixes, grouped fields and a sticky save bar"
```

---

### Task 12: Track view keyboard shortcuts and help dialog

**Files:**

- Create: `apps/web/src/features/track-view/shortcuts.ts`, `shortcuts.test.ts`, `shortcuts-dialog.tsx`
- Modify: `apps/web/src/features/track-view/track-view-page.tsx`, `track-view-page.test.tsx`

**Interfaces:**

- Produces:

```ts
type ShortcutAction =
  | "prev-corner"
  | "next-corner"
  | "zoom-in"
  | "zoom-out"
  | "reset-view"
  | "toggle-list"
  | "toggle-edit"
  | "help";
const SHORTCUTS: { keys: string; action: ShortcutAction; description: string }[];
function shortcutFor(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented">,
): ShortcutAction | null;
function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/track-view/shortcuts.test.ts
import { describe, expect, it } from "vitest";
import { shortcutFor } from "./shortcuts";

const key = (k: string, extra: Partial<KeyboardEvent> = {}, target: Element = document.body) =>
  ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    target,
    ...extra,
  }) as KeyboardEvent;

describe("shortcutFor", () => {
  it.each([
    ["[", "prev-corner"],
    ["]", "next-corner"],
    ["+", "zoom-in"],
    ["=", "zoom-in"],
    ["-", "zoom-out"],
    ["0", "reset-view"],
    ["c", "toggle-list"],
    ["e", "toggle-edit"],
    ["?", "help"],
  ])("%s → %s", (k, action) => {
    expect(shortcutFor(key(k))).toBe(action);
  });

  it("ignores keys with Ctrl, Cmd or Alt", () => {
    expect(shortcutFor(key("e", { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key("0", { metaKey: true }))).toBeNull();
    expect(shortcutFor(key("c", { altKey: true }))).toBeNull();
  });

  it("ignores keys typed into fields, selects and editable content", () => {
    for (const html of [
      "<input>",
      "<textarea></textarea>",
      "<select></select>",
      "<div contenteditable='true'></div>",
    ]) {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      expect(shortcutFor(key("e", {}, host.firstElementChild!))).toBeNull();
      host.remove();
    }
  });

  it("ignores keys inside a dialog or menu, and already-handled keys", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    expect(shortcutFor(key("e", {}, button))).toBeNull();
    dialog.remove();
    expect(shortcutFor(key("e", { defaultPrevented: true }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test shortcuts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/track-view/shortcuts.ts
export type ShortcutAction =
  | "prev-corner"
  | "next-corner"
  | "zoom-in"
  | "zoom-out"
  | "reset-view"
  | "toggle-list"
  | "toggle-edit"
  | "help";

export const SHORTCUTS: { keys: string; action: ShortcutAction; description: string }[] = [
  { keys: "[", action: "prev-corner", description: "Previous corner" },
  { keys: "]", action: "next-corner", description: "Next corner" },
  { keys: "+", action: "zoom-in", description: "Zoom in" },
  { keys: "−", action: "zoom-out", description: "Zoom out" },
  { keys: "0", action: "reset-view", description: "Reset view" },
  { keys: "C", action: "toggle-list", description: "Show or hide the corner list" },
  { keys: "E", action: "toggle-edit", description: "Turn editing on or off" },
  { keys: "?", action: "help", description: "Show these shortcuts" },
];

const MAP: Record<string, ShortcutAction> = {
  "[": "prev-corner",
  "]": "next-corner",
  "+": "zoom-in",
  "=": "zoom-in",
  "-": "zoom-out",
  "0": "reset-view",
  c: "toggle-list",
  C: "toggle-list",
  e: "toggle-edit",
  E: "toggle-edit",
  "?": "help",
};

const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
const LAYER = "[role=dialog], [role=alertdialog], [role=menu]";

export function shortcutFor(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented">,
): ShortcutAction | null {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return null;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest(TYPING) || target?.closest(LAYER)) return null;
  return MAP[e.key] ?? null;
}
```

`shortcuts-dialog.tsx`: a Radix AlertDialog-styled dialog (reuse `AlertDialogContent`, title "Keyboard shortcuts") rendering `SHORTCUTS` as a `<dl>` with `<kbd className="rounded-md border border-border bg-surface px-1.5 font-mono text-xs">` and a "Close" button.

In `TrackView`, one `keydown` listener on `document` (bubble phase, so the side panel's and pick's Escape handlers are unaffected):

```ts
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const action = shortcutFor(e);
    if (!action) return;
    e.preventDefault();
    run(action);
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});
```

where `run` maps to the same handlers the buttons use (`canvas.current?.zoomBy(1.5)`, the corner list toggle, `toggleEdit`, `selectCorner(prev/next id)` using the same wrap-around as `CornerDetails`; prev/next with no corner selected starts at the first/last corner). Add a `?` `IconButton label="Keyboard shortcuts"` with `Keyboard` icon to the More menu as a `DropdownMenuItem`.

- [ ] **Step 4: Add the page-level tests**

In `track-view-page.test.tsx`:

Using the existing `open()` helper:

```tsx
describe("TrackViewPage shortcuts", () => {
  it("moves between corners with ] and [", async () => {
    const { t1, t2, user } = await open({});
    search.set("corner", t1.id);
    rerenderPage();
    await screen.findByTestId("side-panel");
    document.body.focus();
    await user.keyboard("]");
    expect(search.get("corner")).toBe(t2.id);
    await user.keyboard("[");
    expect(search.get("corner")).toBe(t1.id);
  });

  it("toggles edit mode with e, but not while typing in a field", async () => {
    const { t1, user } = await open({});
    search.set("corner", t1.id);
    rerenderPage();
    await screen.findByTestId("side-panel");
    document.body.focus();
    await user.keyboard("e");
    expect(search.get("edit")).toBe("1");

    const notes = await screen.findByLabelText("Corner notes");
    await user.click(notes);
    await user.keyboard("e");
    expect(search.get("edit")).toBe("1");
    expect(notes).toHaveValue(expect.stringMatching(/e$/));
  });

  it("opens the shortcuts help with ?", async () => {
    await open({});
    await screen.findByRole("toolbar", { name: "Map controls" });
    document.body.focus();
    await userEvent.keyboard("?");
    expect(
      await screen.findByRole("alertdialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

```bash
git add apps/web/src/features/track-view
git commit -m "feat(web): keyboard shortcuts in the track view with a help dialog"
```

---

## Phase 4 — Practice mode

### Task 13: Practice controls: sizes, icons, popover options, safe area

**Files:**

- Modify: `apps/web/src/features/practice/practice-page.tsx`, `apps/web/src/features/practice/quick-note.tsx`, `apps/web/src/features/practice/rig/wheel-buttons.tsx`, `apps/web/e2e/practice.spec.ts`
- Create: `apps/web/src/features/practice/practice-controls.test.tsx`

**Interfaces:**

- Consumes: `Popover*`, `IconButton`, `Button`, `Select`.
- Produces: `PracticeShell` header becomes `pt-safe-3 pl-safe-4 pr-safe-4`, main `pb-safe-4 pl-safe-4 pr-safe-4`. `ControlButton` → `h-11 px-4 rounded-xl focus-ring` (44 px everywhere in practice — it is used on a rig at arm's length).

- [ ] **Step 1: Write the failing test**

The `Options` popover lives inside `Practice`, which needs data, so extract it as a presentational component exported from `practice-page.tsx`:

```ts
export function PracticeOptions(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  hasComplexes: boolean;
  mode: StepMode;
  onToggleMode(): void;
  fontSize: FontSize;
  onFontSize(size: FontSize): void;
  fullscreen: { enabled: boolean; active: boolean; toggle(): void };
  wakeLock: WakeLockStatus;
  /** Wheel button settings, or null when no gamepad API. */
  wheel: ReactNode | null;
}): JSX.Element;
```

Export `FontSize` too. The test drives it together with the real navigator, the way `Practice` does:

```tsx
// apps/web/src/features/practice/practice-controls.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useManualNavigator } from "./navigation/use-manual-navigator";
import { PracticeOptions, PracticeShell, type FontSize } from "./practice-page";

function Harness({
  onExit,
  onChange,
  onFontSize = () => {},
}: {
  onExit(): void;
  onChange(i: number): void;
  onFontSize?(s: FontSize): void;
}) {
  const [open, setOpen] = useState(false);
  const { surfaceProps } = useManualNavigator({
    count: 3,
    current: 0,
    onChange,
    onExit,
    paused: open,
  });
  return (
    <PracticeShell
      surfaceProps={surfaceProps}
      controls={
        <PracticeOptions
          open={open}
          onOpenChange={setOpen}
          hasComplexes={false}
          mode="corner"
          onToggleMode={() => {}}
          fontSize="M"
          onFontSize={onFontSize}
          fullscreen={{ enabled: false, active: false, toggle: () => {} }}
          wakeLock="active"
          wheel={null}
        />
      }
    >
      card
    </PracticeShell>
  );
}

describe("PracticeOptions", () => {
  it("closes on Escape without exiting practice, and returns focus", async () => {
    const onExit = vi.fn();
    render(<Harness onExit={onExit} onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Options" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Practice options" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("does not change corners on arrow keys while open", async () => {
    const onChange = vi.fn();
    render(<Harness onExit={() => {}} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("chooses text size with a segmented radio group", async () => {
    const onFontSize = vi.fn();
    render(<Harness onExit={() => {}} onChange={() => {}} onFontSize={onFontSize} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByRole("radio", { name: "M" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "L" }));
    expect(onFontSize).toHaveBeenCalledWith("L");
  });
});
```

How Escape stays inside the popover: `use-manual-navigator.ts` exits on Escape from a bubbling `document` listener but returns early when `e.defaultPrevented` or `paused`. Radix's dismissable layer handles Escape in the capture phase and calls `preventDefault()` before closing, so the navigator already ignores it. Belt and braces: track the popover's `open` state in `Practice` and pass `paused: noting || optionsOpen` to `useManualNavigator`, so arrow keys and Space inside the popover never change corners either. Add that `paused` case to `use-manual-navigator.test.tsx` if it isn't covered.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test practice-controls`
Expected: FAIL — `PracticeOptions` not exported.

- [ ] **Step 3: Implement**

- Controls row: `flex items-center gap-2` (no wrap); track/layout/guide label `truncate text-muted max-md:hidden`; counter `rounded-full bg-surface px-3 py-1 tabular-nums`.
- Buttons: Note → `ControlButton` with `NotebookPen` icon + "Note"; Prev/Next → `ChevronLeft`/`ChevronRight` icons, text visible from `sm` (`<span className="max-sm:sr-only">Prev</span>`), keep `aria-label="Previous corner"` / `"Next corner"`; Exit → `X` icon + "Exit" (keep link name "Exit").
- `PracticeOptions`: `Popover` + `PopoverTrigger asChild` → `ControlButton` with `Settings2` icon and text "Options"; `PopoverContent aria-label="Practice options" data-theme="practice" className="w-72 space-y-4"` containing: "Step by complex" switch-like `ControlButton aria-pressed`, a "Text size" radiogroup of S/M/L (`role="radiogroup" aria-label="Text size"`, native radios styled like the theme toggle, each `size-11`), Fullscreen toggle, wake-lock status, wheel settings.
- `WakeLockIndicator`: dot uses `text-success` / `text-estimate` and the status text is visible (not only a `title`): render the `hint` below as `text-xs text-muted`.
- `quick-note.tsx`: Save/Cancel buttons `size="lg"`; textarea `min-h-32`.
- `wheel-buttons.tsx`: bump its `py-0.5` chips to `px-2.5 py-1 text-xs` and buttons to `Button size="sm"`.

Update `e2e/practice.spec.ts` for anything that opened `<details>` via `summary` — now `getByRole("button", { name: "Options" })`, and the text-size `select` → `getByRole("radio", { name: "L" })`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS, including the existing landscape screenshot test. Clear fixed ids from `KNOWN_VIOLATIONS.practice`.

```bash
git add apps/web/src/features/practice apps/web/e2e
git commit -m "feat(web): 44px practice controls with icons, popover options and safe-area padding"
```

---

### Task 14: Practice card spacing pass

**Files:**

- Modify: `apps/web/src/features/practice/practice-card.tsx`, `practice-card.test.tsx`, `apps/web/e2e/practice.spec.ts`

**Interfaces:** none new; `PracticeCardProps` unchanged.

- [ ] **Step 1: Write the failing e2e check**

In `practice.spec.ts`:

```ts
test("practice card fits the viewport without clipping on a phone in both orientations", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await openPractice(page);
  for (const size of [
    { width: 360, height: 740 },
    { width: 740, height: 360 },
  ]) {
    await page.setViewportSize(size);
    const card = (await page.getByTestId("practice-card").boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(size.height);
    // The cue is never cut mid-line: its box fits inside the card.
    const cue = (await page.getByTestId("practice-cue").boundingBox())!;
    expect(cue.y + cue.height).toBeLessThanOrEqual(card.y + card.height);
  }
});
```

- [ ] **Step 2: Run to verify current behavior**

Run: `pnpm --filter web build && pnpm --filter web exec playwright test e2e/practice.spec.ts --project=mobile`
Expected: if it already passes, keep it as a guard; if it fails, the spacing changes below must make it pass.

- [ ] **Step 3: Implement**

- Replace the repeated `gap-[calc(0.75rem*var(--practice-scale,1))]` with a single CSS variable on the section: `style={{ "--gap": "calc(0.75rem * var(--practice-scale, 1))" }}` and `gap-(--gap)` on every child (Tailwind 4 arbitrary-property shorthand). Same for tile padding `p-(--tile-pad)` where `--tile-pad: calc(1rem * var(--practice-scale,1))`.
- Tiles: `rounded-2xl` → `rounded-3xl`, `dt` gets `tracking-wider`, value line-height `leading-none`.
- Estimate pill: `px-3 py-1.5 text-sm` and an `AlertTriangle` icon (`aria-hidden`) before the text.
- Footer "Next": `rounded-3xl px-5 py-3.5`, prefix `ArrowRight` icon `aria-hidden`; keep the "Next" text (tests assert it).
- Pressure meter `h-3` → `h-2.5 rounded-full` with the track `bg-foreground/10`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm test:e2e`
Expected: PASS.

```bash
git add apps/web/src/features/practice apps/web/e2e/practice.spec.ts
git commit -m "style(web): practice card spacing from one scale variable, clearer estimate and next cues"
```

---

## Phase 5 — Wrap-up

### Task 15: Zero axe violations, screenshots, ADR

**Files:**

- Modify: `apps/web/e2e/a11y.spec.ts`
- Create: `docs/adr/008-design-system.md`
- Modify: `docs/adr/README.md`, `docs/PLAN.md`

- [ ] **Step 1: Make the allowlist mandatory-empty**

Replace the `KNOWN_VIOLATIONS` object with one where every list is `[]`, and add above `scan`:

```ts
test("no page has known violations left", () => {
  expect(Object.values(KNOWN_VIOLATIONS).flat()).toEqual([]);
});
```

- [ ] **Step 2: Run the full e2e suite**

Run: `pnpm --filter web build && pnpm test:e2e`
Expected: PASS on chromium and mobile. If any page fails, fix the cause in that page's component (not the test), commit it as `fix(web): …`, and re-run.

- [ ] **Step 3: Add theme coverage to a11y**

Add a dark-mode pass: wrap the `track` and `home` tests in `for (const scheme of ["light", "dark"] as const)` with `await page.emulateMedia({ colorScheme: scheme })` before navigation. Run again; expected PASS.

- [ ] **Step 4: Capture "after" screenshots and compare**

Run: `SCREENS=1 pnpm --filter web exec playwright test e2e/screens.spec.ts --output=test-results/screens-after`
Open `test-results/screens-before/` and `screens-after/` side by side for each page × scheme × project. Check: nothing overlaps the notch area in mobile shots; toolbar is one row; no text below 12 px; panel form fields align in two columns. Note anything off and fix before continuing.

- [ ] **Step 5: Write ADR-008**

```markdown
# ADR-008: Design system: tokens, sizes and themes

## Status

Accepted — 2026-10-07

## Context

Controls had grown ad-hoc sizes (24–36 px), inputs triggered iOS zoom, the
map toolbar wrapped over the map on phones, and theming was OS-only.

## Decision

- Colors are CSS tokens in `globals.css` using `light-dark()`; `data-theme`
  on `<html>` forces light or dark; practice mode stays forced dark.
- Controls are 40 px (fine pointer) / 44 px (coarse pointer); inputs are
  16 px text below `md`; minimum text 12 px.
- One focus style (`focus-ring`); `*-safe-*` utilities for notch/home-bar
  padding with `viewport-fit=cover`.
- Primitives live in `src/shared/ui` (Button sizes, IconButton, Select,
  Popover, DropdownMenu, Toast, Confirm); features don't hand-roll them.
- `lucide-react` icons, always `aria-hidden` with a text or `aria-label` name.
- Axe (WCAG 2.2 AA) runs on every page in e2e and must pass.

## Consequences

New UI uses the primitives and tokens; raw palette classes and
`window.confirm` are out. `light-dark()` needs Safari 17.5+ / Chrome 123+.
```

Add the row to `docs/adr/README.md` and a "Design system" line to `docs/PLAN.md` §2.1's UI row linking ADR-008.

- [ ] **Step 6: Final verification**

Run from repo root: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm --filter web build && pnpm test:e2e`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e docs
git commit -m "docs: ADR-008 design system; require zero axe violations on every page"
```

---

## Self-review notes

- **Spec coverage:** sizing table → Tasks 3, 8, 9, 11, 13; spacing/heading rhythm → Tasks 4–6, 9, 11, 14; safe areas → Tasks 2, 4, 8, 9, 13; theme → Tasks 2, 4; icons → Tasks 3 onward; track list → Task 5; confirm dialog → Task 10; popover → Task 13; toasts → Tasks 4–6; skip link / aria-current → Task 4; focus ring → Tasks 2–3; reduced motion → Tasks 2, 9; roving toolbar → Tasks 7–8; estimate token → Task 2; shortcuts → Task 12; axe → Tasks 1, 15.
- **Names used across tasks:** `useTheme`, `applyTheme`, `THEME_KEY`, `IconButton({label})`, `Select`, `useRovingFocus`, `MapToolbar`, `useConfirm`/`ConfirmProvider`, `useToast`/`ToastProvider`, `shortcutFor`, `SHORTCUTS`, `PracticeOptions`, `KNOWN_VIOLATIONS` — each defined once in the task that produces it.
- **Accessible names changed on purpose:** top-bar back link ("← Tracks" → "Back to tracks"), Delete trigger ("Delete" → "Delete track"), corner prev/next ("← Tn" → "Previous corner, Tn"). Each task that changes one updates the e2e/unit selectors in the same commit.
