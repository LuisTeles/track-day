export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Uniform scale then translate: screen = point * k + (x, y). Same shape as d3's ZoomTransform. */
export interface Affine {
  k: number;
  x: number;
  y: number;
}

export const IDENTITY: Affine = { k: 1, x: 0, y: 0 };

export function applyAffine(t: Affine, p: Point): Point {
  return { x: p.x * t.k + t.x, y: p.y * t.k + t.y };
}

/** `outer ∘ inner`: apply `inner` first, then `outer`. */
export function composeAffine(outer: Affine, inner: Affine): Affine {
  return { k: outer.k * inner.k, x: outer.k * inner.x + outer.x, y: outer.k * inner.y + outer.y };
}
