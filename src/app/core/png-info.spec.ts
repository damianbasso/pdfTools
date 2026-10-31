import { describe, expect, it } from 'vitest';
import { readPngDpi } from './png-info';

describe('png info', () => {
  it('reads pHYs density as dots per inch', () => {
    const png = pngWithPhys(11811, 11811);
    const dpi = readPngDpi(png);
    expect(dpi?.x).toBeCloseTo(300, 1);
    expect(dpi?.y).toBeCloseTo(300, 1);
  });

  it('ignores a pHYs chunk that only stores an aspect ratio', () => {
    const png = pngWithPhys(1, 1, 0);
    expect(readPngDpi(png)).toBeUndefined();
  });
});

function pngWithPhys(pixelsPerMeterX: number, pixelsPerMeterY: number, unit = 1): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = chunk('IHDR', new Uint8Array(13));
  const density = new Uint8Array(9);
  const view = new DataView(density.buffer);
  view.setUint32(0, pixelsPerMeterX);
  view.setUint32(4, pixelsPerMeterY);
  density[8] = unit;
  const phys = chunk('pHYs', density);
  const out = new Uint8Array(signature.length + ihdr.length + phys.length);
  out.set(signature, 0);
  out.set(ihdr, signature.length);
  out.set(phys, signature.length + ihdr.length);
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  view.setUint32(8 + data.length, 0);
  return out;
}
