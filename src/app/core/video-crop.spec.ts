import { describe, expect, it } from 'vitest';
import type { Margins } from './black-bars';
import {
  cropArguments,
  mapCodedMargins,
  mapDisplayMargins,
  planVideoCrop,
  type QuarterTurn,
  type VideoGeometry,
} from './video-crop';

describe('video crop plan', () => {
  it('adds side bars to an existing codec crop', () => {
    const plan = planVideoCrop(geometry(), { left: 40, right: 41, top: 10, bottom: 10 }, 320, 180);
    expect(plan.previewMargins).toEqual({ left: 40, right: 40, top: 10, bottom: 10 });
    expect(plan.bitstreamCrop).toEqual({ left: 40, right: 40, top: 10, bottom: 22 });
    expect(plan.output).toEqual({ width: 240, height: 160 });
    expect(plan.removesPixels).toBe(true);
    expect(plan.method).toBe('lossless');
    expect(plan.autorotate).toBe(true);
    expect(plan.frameCrop).toEqual({ x: 40, y: 10, width: 240, height: 160 });
    expect(cropArguments(plan)).toEqual([
      '-flags',
      'unaligned',
      '-i',
      'source.mp4',
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-vf',
      'crop=240:160:40:10',
      '-c:v',
      'libx264',
      '-qp',
      '0',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      '1',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      'cropped.mp4',
    ]);
  });

  it('turns display bars on a rotated phone video into coded margins', () => {
    const plan = planVideoCrop(
      geometry({ rotation: 90, codedWidth: 1920, codedHeight: 1080, cropBottom: 0 }),
      { left: 0, right: 0, top: 100, bottom: 80 },
      1080,
      1920,
    );
    expect(plan.bitstreamCrop).toEqual({ left: 100, right: 80, top: 0, bottom: 0 });
    expect(plan.output).toEqual({ width: 1080, height: 1740 });
    expect(plan.previewMargins).toEqual({ left: 0, right: 0, top: 100, bottom: 80 });
    expect(plan.method).toBe('lossless');
    expect(plan.frameCrop).toEqual({ x: 0, y: 100, width: 1080, height: 1740 });
  });

  it('rewrites a top crop so the picture moves instead of being clipped', () => {
    const plan = planVideoCrop(geometry(), { left: 0, right: 0, top: 20, bottom: 10 }, 320, 180);
    expect(plan.method).toBe('lossless');
    expect(plan.output).toEqual({ width: 320, height: 150 });
    expect(plan.frameCrop).toEqual({ x: 0, y: 20, width: 320, height: 150 });
    expect(cropArguments(plan)).toContain('crop=320:150:0:20');
  });

  it('keeps a bottom crop as a stream copy', () => {
    const plan = planVideoCrop(geometry(), { left: 0, right: 0, top: 0, bottom: 20 }, 320, 180);
    expect(plan.method).toBe('copy');
    expect(plan.output).toEqual({ width: 320, height: 160 });
    expect(cropArguments(plan)).toEqual([
      '-i',
      'source.mp4',
      '-map',
      '0',
      '-c',
      'copy',
      '-bsf:v',
      'h264_metadata=crop_left=0:crop_right=0:crop_top=0:crop_bottom=32',
      '-movflags',
      '+faststart',
      'cropped.mp4',
    ]);
  });

  it('crops an unrotated view of a sideways video without baking the rotation', () => {
    const plan = planVideoCrop(
      geometry({ rotation: 90, codedWidth: 1920, codedHeight: 1080, cropBottom: 0 }),
      { left: 100, right: 80, top: 0, bottom: 0 },
      1920,
      1080,
    );
    expect(plan.autorotate).toBe(false);
    expect(plan.method).toBe('lossless');
    expect(plan.frameCrop).toEqual({ x: 100, y: 0, width: 1740, height: 1080 });
    expect(cropArguments(plan).slice(0, 4)).toEqual(['-flags', 'unaligned', '-noautorotate', '-i']);
  });

  it('refuses a shape that is neither the stored frame nor the rotated frame', () => {
    expect(() =>
      planVideoCrop(geometry(), { left: 0, right: 0, top: 0, bottom: 0 }, 100, 100),
    ).toThrow(/cannot be cropped/);
  });

  it('maps display margins in both directions', () => {
    const margins = { left: 1, right: 2, top: 3, bottom: 4 };
    for (const rotation of [0, 90, 180, 270] as const) {
      expect(mapCodedMargins(mapDisplayMargins(margins, rotation), rotation)).toEqual(margins);
    }
  });

  it('builds a stream-copy command for HEVC when the left edge stays put', () => {
    const plan = planVideoCrop(
      geometry({ codec: 'hevc', cropBottom: 0 }),
      { left: 0, right: 4, top: 0, bottom: 6 },
      320,
      192,
    );
    expect(plan.method).toBe('copy');
    expect(cropArguments(plan)).toEqual([
      '-i',
      'source.mp4',
      '-map',
      '0',
      '-c',
      'copy',
      '-bsf:v',
      'hevc_metadata=crop_left=0:crop_right=4:crop_top=0:crop_bottom=6',
      '-movflags',
      '+faststart',
      'cropped.mp4',
    ]);
  });
});

function geometry(
  options: {
    rotation?: QuarterTurn;
    codedWidth?: number;
    codedHeight?: number;
    cropBottom?: number;
    codec?: 'h264' | 'hevc';
  } = {},
): VideoGeometry {
  const codedWidth = options.codedWidth ?? 320;
  const codedHeight = options.codedHeight ?? 192;
  const cropBottom = options.cropBottom ?? 12;
  const crop: Margins = { left: 0, right: 0, top: 0, bottom: cropBottom };
  return {
    codec: options.codec ?? 'h264',
    rotation: options.rotation ?? 0,
    codedWidth,
    codedHeight,
    crop,
    croppedWidth: codedWidth - crop.left - crop.right,
    croppedHeight: codedHeight - crop.top - crop.bottom,
    cropUnitX: 2,
    cropUnitY: 2,
  };
}
