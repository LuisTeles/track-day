# 007. A car's racing line from turn-in, apex and exit

- Status: Accepted
- Date: 2026-10-07

## Context

Users want to mark the line they take through a corner, per car, on a phone or tablet as easily as on a desktop. Positions along the outline already exist (`CornerGuide.line.turnInAt/apexAt/exitAt`), but a line through three centerline points is the centerline. There is no track-width data.

## Decision

- The user places turn-in, apex and exit along the outline (snapped to the nearest point).
- The app offsets each point by half a nominal 12 m width: turn-in and exit to the outside, the apex to the inside. Outside is the opposite side of `Corner.direction`; the outline runs in the driving direction (ADR-005), so the side follows from its tangent.
- A lead-in 40 m before turn-in and a lead-out 40 m after exit, on the outside, then a centripetal Catmull-Rom curve.
- Missing turn-in or exit is estimated (60 m before / 50 m after the apex) and drawn dashed. No direction, or no apex and no corner position: no line.
- Without an apex point the corner's own position stands in for it, and the track view draws that line dashed as an estimate too.
- A car's generated line is drawn on top of the layout's imported line, which is dimmed; in practice it replaces it.
- A corner complex is drawn as one line through its corners in lap order.

## Consequences

- No new stored fields; the line is derived on the fly.
- Lines are approximate on wide or narrow tracks. A later step can add a lateral offset per point (dragging across the track) without changing what is stored today.
