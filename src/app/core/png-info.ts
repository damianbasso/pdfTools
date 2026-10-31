import { isPng } from './sniff';

export interface PngDensity {
  x: number;
  y: number;
}

/** pHYs unit 1 is pixels per meter. Other units are an aspect ratio, not a print size. */
export function readPngDpi(data: Uint8Array): PngDensity | undefined {
  if (!isPng(data) || data.length < 8) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = view.getUint32(offset);
    const dataStart = offset + 8;
    if (dataStart + length + 4 > data.length) return undefined;
    const type = chunkType(data, offset + 4);
    if (type === 'pHYs' && length >= 9) {
      const pixelsPerMeterX = view.getUint32(dataStart);
      const pixelsPerMeterY = view.getUint32(dataStart + 4);
      const unit = data[dataStart + 8];
      if (unit !== 1 || pixelsPerMeterX <= 0 || pixelsPerMeterY <= 0) return undefined;
      return { x: pixelsPerMeterX * 0.0254, y: pixelsPerMeterY * 0.0254 };
    }
    if (type === 'IDAT' || type === 'IEND') return undefined;
    offset = dataStart + length + 4;
  }
  return undefined;
}

function chunkType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}
