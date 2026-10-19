# M4 — Cars & guides (design, 2026-10-19)

## Why

Cars only exist as a side effect of "Add car" in the track view. There is no place to see or fix them, a car can't get a guide on a second layout without creating a duplicate car, the car → class fallback (ADR-004) exists in code but never reaches the screen, AI estimates can only lose their badge by editing a value, and two cars can't be compared.

## Goals

- A garage: list, add, edit and delete car classes and cars; starter classes on demand.
- A global "driving with" car + sim, remembered on the device, that picks the guide a track opens with, using the ADR-004 fallback.
- Show when a guide comes from the car's class rather than the car.
- Confirm AI estimates after driving, per corner or for a whole car.
- Compare two cars corner by corner.

## Non-goals

- Syncing the "driving with" choice anywhere (it is a device preference, like the other toggles).
- Car specs feeding anything (power, weight… are stored and shown, not used).
- Changing a guide's target (car ↔ class) after it exists.

## Constraints

- No schema or backup change: every field exists (`Car`, `CarClass`, `Guide.target`, `CornerGuide.source/confidence`).
- Repositories only (ADR-001); deletes are soft deletes behind a confirm, in one transaction.
- ADR-008 forms and accessibility; existing names e2e relies on (the track view's "Car" picker, "+ Add car…") stay.

## Design

### Garage (`/cars/`, "Cars" in the header)

- Classes as sections, each listing its cars. Empty state offers **Add starter classes** (Formula, GT3, GT4, Road car, Drift; existing names are skipped).
- Class form: name (unique, case-insensitive), description, drivetrain, downforce.
- Car form: name, class, sim, power (hp), weight (kg), drivetrain, downforce, transmission, ABS, TC.
- Deleting a car deletes its guides and their corner guides. Deleting a class is refused while it has cars; otherwise it deletes the class guides. Both confirm with how many guides go.

### Driving with

- Header control on the main pages: a car select (grouped by class) and a sim select ("Any sim" + sims). Picking a car sets the sim to the car's own sim. Stored in `localStorage` (`driving-with`), read through a small external store so every view updates at once; storage failures mean "no car".
- Track view: when the URL has no `guide`, the guide is `resolveGuide(guides, car, sim)`; with no match (or no car chosen) it falls back to the first guide as today. The "Car" picker still lists the layout's guides and overrides the default for that view.
- **Fallback in the UI:** when the shown guide targets the class of the car you drive (not the car), the corner panel and setup panel say "Class guide — no {car} guide on this layout yet", and edit mode offers **Add a guide for {car}**.

### Add car → add guide

The track view's Add car dialog gets a first choice: **Existing car** (from the garage, only cars without a guide on this layout) or **New car** (today's fields). Either way it then starts empty or from an AI guide, as today.

### Confirming estimates

- Corner panel (read mode) and the car values form: a **Mark as confirmed** button on AI / low-confidence values sets `source: "manual"`, `confidence: null` without changing numbers.
- Setup panel in edit mode: **Confirm all estimates for this car** (asks first, shows the count).

### Compare (`/tracks/compare/?track=&layout=&a=&b=&corner=`)

- Two guide pickers (the layout's guides), then one card per corner in lap order: entry / minimum / exit speed, gear (with downshift), brake reference or board, brake pressure, cue, notes, with estimate markers as text. `corner` scrolls to and highlights that corner.
- Opened from the track view's More menu (**Compare cars**, needs two guides), preselecting the current guide.

### Data layer

`CarDeletionService.deleteCar(carId)` and `deleteCarClass(classId)` (Dexie, transactional, with the cascade above). Everything else uses the existing repositories.

## Calls made without asking

1. The global selector is a default, not a lock: the track view picker still switches guides per view.
2. Starter classes are a button, not inserted automatically, so a fresh install stays empty until you ask.
3. Deleting a car deletes its guides (nothing else would ever show them).
4. "Confirm" only clears the estimate marking; it never changes values.
5. Compare is its own page (it needs the width of a table), not a side panel.
