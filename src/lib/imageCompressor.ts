/**
 * Client-side image compression to minimize data usage on uploads.
 * Resizes and compresses images before uploading to storage.
 */

interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  outputType?: 'image/jpeg' | 'image/webp';
}

const DEFAULT_OPTIONS: CompressOptions = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.7,
  outputType: 'image/jpeg',
};

/**
 * Compress an image File, returning a smaller File.
 * Typical reduction: 3MB → 150-300KB
 */
export async function compressImage(
  file: File,
  options?: CompressOptions
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Skip if already small (< 200KB)
  if (file.size < 200 * 1024) return file;

  // Skip non-image files
  if (!file.type.startsWith('image/')) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const maxW = opts.maxWidth!;
      const maxH = opts.maxHeight!;

      // Scale down proportionally
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          // If compressed is larger than original, use original
          if (blob.size >= file.size) { resolve(file); return; }

          const ext = opts.outputType === 'image/webp' ? '.webp' : '.jpg';
          const name = file.name.replace(/\.[^.]+$/, ext);
          const compressed = new File([blob], name, { type: opts.outputType });

          console.log(
            `Image compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (${Math.round((1 - compressed.size / file.size) * 100)}% reduction)`
          );
          resolve(compressed);
        },
        opts.outputType,
        opts.quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback to original
    };

    img.src = url;
  });
}

/**
 * Compress for logos (smaller dimensions, higher quality)
 */
export function compressLogo(file: File): Promise<File> {
  return compressImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.8 });
}

/**
 * Compress for photos (facade, product photos)
 */
export function compressPhoto(file: File): Promise<File> {
  return compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.65 });
}
