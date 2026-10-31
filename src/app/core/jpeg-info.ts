export interface JpegDensity {
  x: number;
  y: number;
}

export function readJpegDpi(data: Uint8Array): JpegDensity | undefined {
  return readJpegSegments(data, (marker, view, offset, length) => {
    if (marker !== 0xe0 || length < 16) return undefined;
    if (!matches(view, offset + 2, [0x4a, 0x46, 0x49, 0x46, 0x00])) return undefined;
    const units = view[offset + 9];
    const x = (view[offset + 10] << 8) | view[offset + 11];
    const y = (view[offset + 12] << 8) | view[offset + 13];
    if (x <= 0 || y <= 0) return undefined;
    if (units === 1) return { x, y };
    if (units === 2) return { x: x * 2.54, y: y * 2.54 };
    return undefined;
  });
}

/** EXIF orientation 2-8 means the stored JPEG pixels are not upright. */
export function jpegNeedsRaster(data: Uint8Array): boolean {
  const orientation = readJpegOrientation(data);
  return orientation >= 2 && orientation <= 8;
}

export function readJpegOrientation(data: Uint8Array): number {
  const found = readJpegSegments(data, (marker, view, offset, length) => {
    if (marker !== 0xe1 || length <= 14) return undefined;
    const start = offset + 2;
    if (!matches(view, start, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00])) return undefined;
    return readExifOrientation(view, start + 6, offset + length);
  });
  return found ?? 1;
}

function readJpegSegments<T>(
  data: Uint8Array,
  visit: (marker: number, view: Uint8Array, offset: number, length: number) => T | undefined,
): T | undefined {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 1 < data.length) {
    if (data[offset] !== 0xff) return undefined;
    let marker = data[offset + 1];
    offset += 2;
    while (marker === 0xff && offset < data.length) {
      marker = data[offset];
      offset += 1;
    }
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue;
    if (offset + 1 >= data.length) return undefined;
    const length = (data[offset] << 8) | data[offset + 1];
    if (length < 2 || offset + length > data.length) return undefined;
    const found = visit(marker, data, offset, length);
    if (found !== undefined) return found;
    offset += length;
  }
  return undefined;
}

function readExifOrientation(
  data: Uint8Array,
  tiffStart: number,
  segmentEnd: number,
): number | undefined {
  if (tiffStart + 8 > segmentEnd) return undefined;
  const little = data[tiffStart] === 0x49 && data[tiffStart + 1] === 0x49;
  const big = data[tiffStart] === 0x4d && data[tiffStart + 1] === 0x4d;
  if (!little && !big) return undefined;

  const read16 = (position: number): number =>
    little
      ? data[position] | (data[position + 1] << 8)
      : (data[position] << 8) | data[position + 1];
  const read32 = (position: number): number =>
    little
      ? data[position] |
        (data[position + 1] << 8) |
        (data[position + 2] << 16) |
        (data[position + 3] << 24)
      : ((data[position] << 24) |
          (data[position + 1] << 16) |
          (data[position + 2] << 8) |
          data[position + 3]) >>>
        0;

  if (read16(tiffStart + 2) !== 42) return undefined;
  const ifdOffset = read32(tiffStart + 4);
  let position = tiffStart + ifdOffset;
  if (position + 2 > segmentEnd) return undefined;
  const count = read16(position);
  position += 2;
  for (let index = 0; index < count; index++) {
    if (position + 12 > segmentEnd) return undefined;
    if (read16(position) === 0x0112) {
      const value = read16(position + 8);
      return value >= 1 && value <= 8 ? value : undefined;
    }
    position += 12;
  }
  return undefined;
}

function matches(data: Uint8Array, offset: number, expected: number[]): boolean {
  if (offset + expected.length > data.length) return false;
  return expected.every((byte, index) => data[offset + index] === byte);
}
