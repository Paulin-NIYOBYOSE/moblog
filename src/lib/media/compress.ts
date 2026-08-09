// Client-side image compression before upload — images are stored directly
// in Postgres, so shrinking large screenshots down first keeps the database
// lean. Uses only native browser APIs (no new dependency).

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  opts?: { maxDimension?: number; quality?: number },
): Promise<CompressedImage> {
  const maxDimension = opts?.maxDimension ?? 1920;
  const quality = opts?.quality ?? 0.85;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, width: bitmap.width, height: bitmap.height };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return { blob: file, width, height };

  // Fall back to the original if compression somehow made it bigger.
  if (blob.size >= file.size && file.size < 4 * 1024 * 1024) {
    return { blob: file, width, height };
  }
  return { blob, width, height };
}
