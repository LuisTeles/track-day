# 008. Design system: tokens, sizes and themes

- Status: Accepted
- Date: 2026-10-07

## Context

Controls had grown ad-hoc sizes (24-36 px), inputs triggered iOS zoom, the map toolbar wrapped over the map on phones, and theming followed the OS only.

## Decision

- **Tokens:** colors are CSS tokens in `globals.css` using `light-dark()`. `data-theme` on `<html>` forces light or dark; practice mode stays forced dark. The preference is stored in localStorage, applied in the theme setter (no mount effect) and, before first paint, by an inline script in `<head>`.
- **Sizes:** controls are 40 px (fine pointer) or 44 px (coarse pointer). Inputs use 16 px text below `md`, so iOS doesn't zoom. Minimum text is 12 px. The light `--estimate` color is `#854d0e` to meet contrast.
- **Focus and safe areas:** one focus style (`focus-ring`); `*-safe-*` utilities pad for the notch and home bar, with `viewport-fit=cover`.
- **Primitives** live in `src/shared/ui`: Button sizes, IconButton, Select, Popover, DropdownMenu, Toast and Confirm. Features don't hand-roll them.
  - Toasts are `pointer-events-none`, so they never block the map.
  - Confirmation is `ConfirmProvider` / `useConfirm()`, replacing `window.confirm`. Leaving with unsaved edits takes a continuation (`leaveEdits(next)`).
  - The map toolbar is one row; arrow keys move focus between its controls, and every control stays a Tab stop. The shortcuts help lives in its More menu.
- **Icons:** `lucide-react`, always `aria-hidden`, with a visible text or `aria-label` name.
- **Accessibility:** axe (WCAG 2.2 AA) runs in e2e on every page in light, and on home and the track view in dark too, with no allowed violations.

## Consequences

New UI uses the primitives and tokens; raw palette classes and `window.confirm` are out. `light-dark()` needs Safari 17.5+ or Chrome 123+.
