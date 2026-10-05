/**
 * Moves through the practice steps. v1 is driven by the user (keys, taps,
 * swipes, gamepad); a future PositionNavigator fed by the companion app's lap
 * position implements the same interface and calls `goTo` (ADR-006).
 */
export interface CornerNavigator {
  current: number;
  count: number;
  next(): void;
  prev(): void;
  goTo(index: number): void;
}

/** Index after `current`, wrapping from the last corner back to the first (a lap). */
export const nextIndex = (current: number, count: number) =>
  count === 0 ? 0 : (current + 1) % count;
export const prevIndex = (current: number, count: number) =>
  count === 0 ? 0 : (current - 1 + count) % count;
export const clampIndex = (index: number, count: number) =>
  count === 0 ? 0 : Math.min(Math.max(0, Math.trunc(index)), count - 1);
