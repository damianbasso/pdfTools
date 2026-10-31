import { describe, expect, it } from 'vitest';
import { contentBox, marginsAround } from './black-bars';
import { sampleTimes } from './video-sample';

describe('black bars', () => {
  it('ignores a black border and a single bright speck', () => {
    const width = 12;
    const height = 10;
    const rgba = new Uint8Array(width * height * 4);
    fill(rgba, width, 2, 2, 8, 6, 240);
    rgba[(1 * width + 0) * 4] = 255;
    rgba[(1 * width + 0) * 4 + 3] = 255;

    const box = contentBox(rgba, width, height, 24);
    expect(box).toEqual({ left: 2, top: 2, right: 10, bottom: 8 });
    expect(marginsAround(box ? [box] : [], width, height)).toEqual({
      left: 2,
      right: 2,
      top: 2,
      bottom: 2,
    });
  });

  it('keeps pixels that are bright in any sample', () => {
    const first = { left: 4, top: 2, right: 10, bottom: 8 };
    const second = { left: 2, top: 3, right: 9, bottom: 7 };
    expect(marginsAround([first, second], 12, 10)).toEqual({
      left: 2,
      right: 2,
      top: 2,
      bottom: 2,
    });
  });

  it('returns no box for an empty or fully black frame', () => {
    expect(contentBox(new Uint8Array(8 * 8 * 4), 8, 8, 24)).toBeNull();
    expect(marginsAround([], 8, 8)).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it('samples the middle of a clip and one frame of a short one', () => {
    expect(sampleTimes(0)).toEqual([0]);
    expect(sampleTimes(10)).toEqual([1.2, 3, 5, 7, 8.8]);
  });
});

function fill(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number,
  color: number,
): void {
  for (let row = y; row < y + boxHeight; row++) {
    for (let column = x; column < x + boxWidth; column++) {
      const index = (row * width + column) * 4;
      rgba[index] = color;
      rgba[index + 1] = color;
      rgba[index + 2] = color;
      rgba[index + 3] = 255;
    }
  }
}
