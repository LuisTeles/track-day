# 006. Practice mode

- Status: Accepted (the wheel-button section is updated after the P5 spike)
- Date: 2026-10-04

## Context

Practice mode shows one corner per screen on a phone, tablet or second monitor next to the rig, advanced by a button press. It must be readable at a glance, work offline, and leave room for automatic advancing from the car's position later.

## Decision

- **Route:** `/tracks/practice/?track=&layout=&guide=&corner=<number>` (query params, per ADR-003). `corner` is the corner _number_, so reloads and shared links land on the same corner. Updates use `router.replace`, which adds no history entries.
- **Guide selection:** `?guide=<id>`, defaulting to the layout's first guide. When the M4 car picker exists, `?car=&sim=` will resolve through `resolveGuide()` (ADR-004).
- **Navigator seam:** the card is presentational. The page takes the current step from a `CornerNavigator { current; next(); prev(); goTo(i) }`. v1 is a manual navigator (keys, taps, swipes, optionally a gamepad button). A future `PositionNavigator` (companion app → WebSocket → lap position) implements the same interface.
- **New `CornerGuide` fields**, all optional and defaulting to `null`, so `schemaVersion` stays 1:
  - `brakePressure`: none, light, firm or heavy;
  - `brakePressurePct` (0–100);
  - `cue`: up to 160 characters; the prompt asks for ≤ 90 and the card clamps it to two lines;
  - `downshiftTo`: the lowest gear under braking, when it differs from the apex `gear`.
- **`brakeMarkerMeters` is defined** as the distance-board value: meters before the turn-in point (`line.turnInAt`). When turn-in is unknown, it is measured back from the apex and drawn as approximate.
- **Estimates:** a value shows as an estimate when `source === "ai"` or `confidence === "low"`. Telemetry is measured, so it is not an estimate.
- **Platform limits:**
  - The Screen Wake Lock API needs a secure context (HTTPS or localhost).
  - The Fullscreen API isn't available on iPhone; installing the app as a PWA is the iPhone path.
  - The Gamepad API only sees devices on the same machine, so a wheel button can only drive practice mode on a desktop second monitor, never on a phone or tablet.

## Wheel button spike (P5)

**Status: pending a manual check on the sim PC.** The binding is built (Options → _Wheel button · experimental_) and tested with a simulated gamepad, but whether it works _while Assetto Corsa is running_ can only be checked on real hardware.

Known going in:

- Chrome on Windows exposes most wheels (Logitech, Fanatec, Thrustmaster) through the Gamepad API.
- Chrome keeps delivering gamepad input to a _visible_ page in an unfocused window (that's how gamepad overlay tools work). Firefox needs focus.
- Unknown: whether AC's exclusive DirectInput access (for force feedback) hides the device's buttons from Chrome.

Checklist:

1. Open practice mode in Chrome on a second monitor of the sim PC. In Options, set a wheel button for "next".
2. Without AC running: the button advances the corner.
3. Start AC, get on track, focus the game, and press the button. Does the card advance?
4. Repeat with Chrome minimized (expected to stop: rAF and gamepad polling pause for hidden pages).

Record the result here. If step 3 fails, the button route is closed, and auto-advance needs the companion app (future `PositionNavigator`).

## Consequences

- Auto-advance later replaces only the navigator; the card and the session data stay as they are.
- AI guide imports can fill the new fields; older data shows `—` for them.
- Testing on a phone against the dev server needs HTTPS for Wake Lock (`next dev --experimental-https` or a tunnel).
