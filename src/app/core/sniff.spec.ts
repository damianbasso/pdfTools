import { describe, expect, it } from 'vitest';
import { isBigTiff, isJpeg, isPdf, isTiff, sniffDocument } from './sniff';

describe('sniffDocument', () => {
  it('recognizes PDF bytes even with a short preamble', () => {
    const bytes = new Uint8Array([0x00, 0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(isPdf(bytes)).toBe(true);
    expect(sniffDocument(bytes)).toBe('pdf');
  });

  it('recognizes JPEG and TIFF headers', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00]);
    const big = new Uint8Array([0x4d, 0x4d, 0x00, 0x2b]);
    expect(isJpeg(jpeg)).toBe(true);
    expect(isTiff(tiff)).toBe(true);
    expect(isBigTiff(big)).toBe(true);
    expect(sniffDocument(jpeg)).toBe('jpeg');
    expect(sniffDocument(tiff)).toBe('tiff');
    expect(sniffDocument(big)).toBe('bigtiff');
    expect(sniffDocument(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
