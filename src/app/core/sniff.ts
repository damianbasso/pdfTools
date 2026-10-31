export type DocumentKind = 'pdf' | 'jpeg' | 'png' | 'tiff';

export const PDF_ACCEPT = '.pdf,application/pdf';
export const IMAGE_ACCEPT = '.jpg,.jpeg,.tif,.tiff,image/jpeg,image/tiff';
export const IMAGE_PDF_ACCEPT = '.jpg,.jpeg,.png,.tif,.tiff,image/jpeg,image/png,image/tiff';

export function sniffDocument(data: Uint8Array): DocumentKind | 'bigtiff' | null {
  if (isPdf(data)) return 'pdf';
  if (isJpeg(data)) return 'jpeg';
  if (isPng(data)) return 'png';
  if (isBigTiff(data)) return 'bigtiff';
  if (isTiff(data)) return 'tiff';
  return null;
}

export function isPdf(data: Uint8Array): boolean {
  const limit = Math.min(data.length, 1024);
  for (let index = 0; index <= limit - 4; index++) {
    if (
      data[index] === 0x25 &&
      data[index + 1] === 0x50 &&
      data[index + 2] === 0x44 &&
      data[index + 3] === 0x46
    ) {
      return true;
    }
  }
  return false;
}

export function isJpeg(data: Uint8Array): boolean {
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}

export function isPng(data: Uint8Array): boolean {
  return (
    data.length > 7 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  );
}

export function isTiff(data: Uint8Array): boolean {
  return isLittleTiff(data) || isBigEndianTiff(data);
}

export function isBigTiff(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  const little = data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2b && data[3] === 0x00;
  const big = data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2b;
  return little || big;
}

function isLittleTiff(data: Uint8Array): boolean {
  return (
    data.length > 3 && data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2a && data[3] === 0x00
  );
}

function isBigEndianTiff(data: Uint8Array): boolean {
  return (
    data.length > 3 && data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2a
  );
}
