/** Longest side, in pixels, that a stored reference image keeps. */
export const MAX_IMAGE_SIDE = 1600;

const KEEP_AS_IS = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Decodes an image and, when it is larger than `maxSide` (or in a format not
 * worth keeping), re-encodes a scaled copy. Returns the bytes to store with
 * their final size. Throws when the file isn't an image the browser can read.
 */
export async function downscaleImage(
  file: Blob,
  maxSide = MAX_IMAGE_SIDE,
): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn’t an image this browser can read.");
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    if (scale === 1 && KEEP_AS_IS.has(file.type)) return { blob: file, width, height };

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob) throw new Error("Could not resize the image.");
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
