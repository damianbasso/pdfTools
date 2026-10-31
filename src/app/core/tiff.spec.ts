import { describe, expect, it } from 'vitest';
import { decodeTiffPages, encodeMultiPageTiff, tiffSummary } from './tiff';

function solid(width: number, height: number, rgba: [number, number, number, number]): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  for (let index = 0; index < bytes.length; index += 4) {
    bytes[index] = rgba[0];
    bytes[index + 1] = rgba[1];
    bytes[index + 2] = rgba[2];
    bytes[index + 3] = rgba[3];
  }
  return bytes;
}

describe('multi-page TIFF', () => {
  it('round-trips pages, resolution, and flattened transparency', () => {
    const wide = solid(32, 8, [10, 20, 30, 255]);
    wide[3] = 0;
    const encoded = encodeMultiPageTiff([
      { rgba: wide, width: 32, height: 8, dpiX: 300, dpiY: 300 },
      { rgba: solid(1, 1, [0, 255, 0, 255]), width: 1, height: 1 },
    ]);

    expect(tiffSummary(encoded)).toMatchObject({ pageCount: 2, width: 32, height: 8 });
    const pages = decodeTiffPages(encoded);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.width).toBe(32);
    expect(pages[0]?.height).toBe(8);
    expect(pages[0]?.dpiX).toBeCloseTo(300, 0);
    expect(pages[0]?.rgba[0]).toBe(255);
    expect(pages[0]?.rgba[1]).toBe(255);
    expect(pages[0]?.rgba[2]).toBe(255);
    expect(pages[0]?.rgba[4]).toBe(10);
    expect(pages[0]?.rgba[5]).toBe(20);
    expect(pages[0]?.rgba[6]).toBe(30);
    expect(pages[1]?.width).toBe(1);
    expect(pages[1]?.rgba[1]).toBe(255);
  });

  it('applies the orientation tag while decoding', () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const encoded = encodeMultiPageTiff([{ rgba, width: 2, height: 2, orientation: 6 }]);
    const [page] = decodeTiffPages(encoded);
    expect(page?.width).toBe(2);
    expect(page?.rgba[0]).toBe(0);
    expect(page?.rgba[2]).toBe(255);
    expect(page?.rgba[4]).toBe(255);
    expect(page?.rgba[5]).toBe(0);
  });

  it('rejects BigTIFF and files that are not TIFF', () => {
    expect(() => decodeTiffPages(new Uint8Array([0x49, 0x49, 0x2b, 0x00]))).toThrow(/BigTIFF/);
    expect(() => tiffSummary(new Uint8Array([1, 2, 3, 4]))).toThrow(/not a TIFF/);
  });
});
