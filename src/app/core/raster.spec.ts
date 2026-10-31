import { describe, expect, it } from 'vitest';
import { applyTiffOrientation, rgbaToRgb, toRational } from './raster';

function pixel(rgba: Uint8Array, width: number, x: number, y: number): number[] {
  const index = (y * width + x) * 4;
  return [rgba[index], rgba[index + 1], rgba[index + 2], rgba[index + 3]];
}

describe('raster helpers', () => {
  it('composites transparency onto white', () => {
    const rgb = rgbaToRgb(new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128]));
    expect(Array.from(rgb.slice(0, 3))).toEqual([255, 0, 0]);
    expect(Array.from(rgb.slice(3, 6))).toEqual([255, 255, 255]);
    expect(Array.from(rgb.slice(6, 9))).toEqual([127, 127, 127]);
  });

  it('rotates pixels to match TIFF orientation 6', () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const turned = applyTiffOrientation(rgba, 2, 2, 6);
    expect(turned.width).toBe(2);
    expect(turned.height).toBe(2);
    expect(pixel(turned.rgba, 2, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixel(turned.rgba, 2, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(turned.rgba, 2, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  it('leaves upright images untouched and rounds dpi', () => {
    const rgba = new Uint8Array(16);
    expect(applyTiffOrientation(rgba, 2, 2, 1).rgba).toBe(rgba);
    expect(toRational(300)).toEqual({ numerator: 300, denominator: 1 });
  });
});
