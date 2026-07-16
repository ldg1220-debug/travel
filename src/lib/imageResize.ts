const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Downscales and re-compresses an image file in the browser before upload.
 * Phone camera photos are routinely 5-15MB — comfortably past what a
 * serverless upload route can reliably accept in one request (this is what
 * was silently failing uploads on mobile while smaller desktop test images
 * went through fine) — and needlessly large for a review photo anyway.
 * Falls back to the original file if resizing fails for any reason (e.g.
 * an unsupported format, or a browser without canvas/createImageBitmap).
 */
export async function resizeImageFile(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;

    const name = `${file.name.replace(/\.\w+$/, "")}.jpg`;
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Resizes every file in a list, in parallel. */
export function resizeImageFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(resizeImageFile));
}
