import type { RasterPage } from './raster';

export function revokeThumb(url: string | undefined): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

export function releaseDocuments(files: readonly { thumbUrl?: string }[]): void {
  for (const file of files) revokeThumb(file.thumbUrl);
}

export function imageThumbUrl(bytes: Uint8Array, mime: string): string {
  return URL.createObjectURL(new Blob([bytes.slice()], { type: mime }));
}

export function jpegThumbUrl(bytes: Uint8Array): string {
  return imageThumbUrl(bytes, 'image/jpeg');
}

export async function decodeBrowserImage(
  bytes: Uint8Array,
  mime = 'image/jpeg',
): Promise<RasterPage> {
  const blob = new Blob([bytes.slice()], { type: mime });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    const label = mime === 'image/png' ? 'PNG' : 'JPEG';
    throw new Error(`Could not decode this ${label}.`);
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser could not read the image.');
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      rgba: new Uint8Array(image.data),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

export function rasterDataUrl(page: RasterPage, maxSize = 96): string {
  const longest = Math.max(page.width, page.height);
  if (!longest) return '';
  const scale = Math.min(1, maxSize / longest);
  const width = Math.max(1, Math.round(page.width * scale));
  const height = Math.max(1, Math.round(page.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(page.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(page.width - 1, Math.floor(x / scale));
      const sourceIndex = (sourceY * page.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      image.data[target] = page.rgba[sourceIndex] ?? 0;
      image.data[target + 1] = page.rgba[sourceIndex + 1] ?? 0;
      image.data[target + 2] = page.rgba[sourceIndex + 2] ?? 0;
      image.data[target + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.82);
}
