import type { Affine, Bounds, Size } from "./types";

/**
 * Scale and offset that fit `bounds` inside `viewport` with `padding` on every
 * side, preserving the aspect ratio and centering the result. Works for any
 * shape: tall, wide or square.
 */
export function fitToViewport(bounds: Bounds, viewport: Size, padding = 0): Affine {
  const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const availableW = Math.max(viewport.width - 2 * padding, 1);
  const availableH = Math.max(viewport.height - 2 * padding, 1);
  const k = Math.min(availableW / width, availableH / height);
  return {
    k,
    x: (viewport.width - width * k) / 2 - bounds.minX * k,
    y: (viewport.height - height * k) / 2 - bounds.minY * k,
  };
}
