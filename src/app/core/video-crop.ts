import type { Margins } from './black-bars';
import { ZERO_MARGINS } from './black-bars';

export type QuarterTurn = 0 | 90 | 180 | 270;

export interface VideoGeometry {
  codec: 'h264' | 'hevc';
  rotation: QuarterTurn;
  codedWidth: number;
  codedHeight: number;
  /** Luma pixels already removed by the codec's crop window. */
  crop: Margins;
  croppedWidth: number;
  croppedHeight: number;
  cropUnitX: number;
  cropUnitY: number;
}

export interface FrameCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropPlan {
  codec: 'h264' | 'hevc';
  /** Margins in the same orientation as the preview element. */
  previewMargins: Margins;
  /** Size a player shows after the crop, rotation included. */
  output: { width: number; height: number };
  /**
   * Replacement crop window in coded luma pixels.
   * The bitstream filter overwrites the existing window, so this includes it.
   */
  bitstreamCrop: Margins;
  removesPixels: boolean;
  /**
   * Copy edits the codec crop window. Lossless rewrites the picture when the
   * crop starts at the top or left, because those windows shrink the frame
   * without moving the picture.
   */
  method: 'copy' | 'lossless';
  /** Crop of the frame the browser showed, in that frame's pixels. */
  frameCrop: FrameCrop;
  /** When true, the stored frame is rotated before the lossless crop. */
  autorotate: boolean;
}

export function displaySize(geometry: VideoGeometry): { width: number; height: number } {
  if (geometry.rotation === 90 || geometry.rotation === 270) {
    return { width: geometry.croppedHeight, height: geometry.croppedWidth };
  }
  return { width: geometry.croppedWidth, height: geometry.croppedHeight };
}

/** Maps bars measured on the rotated picture back onto the stored frame. */
export function mapDisplayMargins(margins: Margins, rotation: QuarterTurn): Margins {
  switch (rotation) {
    case 0:
      return { ...margins };
    case 90:
      return {
        left: margins.top,
        top: margins.right,
        right: margins.bottom,
        bottom: margins.left,
      };
    case 180:
      return {
        left: margins.right,
        right: margins.left,
        top: margins.bottom,
        bottom: margins.top,
      };
    case 270:
      return {
        left: margins.bottom,
        top: margins.left,
        right: margins.top,
        bottom: margins.right,
      };
  }
}

export function mapCodedMargins(margins: Margins, rotation: QuarterTurn): Margins {
  switch (rotation) {
    case 0:
      return { ...margins };
    case 90:
      return {
        left: margins.bottom,
        top: margins.left,
        right: margins.top,
        bottom: margins.right,
      };
    case 180:
      return mapDisplayMargins(margins, 180);
    case 270:
      return {
        left: margins.top,
        top: margins.right,
        right: margins.bottom,
        bottom: margins.left,
      };
  }
}

export function planVideoCrop(
  geometry: VideoGeometry,
  margins: Margins,
  presentedWidth: number,
  presentedHeight: number,
): CropPlan {
  const display = displaySize(geometry);
  const codedFrame = { width: geometry.croppedWidth, height: geometry.croppedHeight };
  const onDisplay = presentedWidth === display.width && presentedHeight === display.height;
  const onCoded = presentedWidth === codedFrame.width && presentedHeight === codedFrame.height;
  if (!onDisplay && !onCoded) {
    throw new Error('This video uses a pixel shape that cannot be cropped here.');
  }

  const frame = onDisplay ? display : codedFrame;
  const requested = clampMargins(wholeMargins(margins), frame.width, frame.height);
  const additional = alignMargins(
    onDisplay ? mapDisplayMargins(requested, geometry.rotation) : requested,
    geometry.cropUnitX,
    geometry.cropUnitY,
  );
  const bitstreamCrop = {
    left: geometry.crop.left + additional.left,
    right: geometry.crop.right + additional.right,
    top: geometry.crop.top + additional.top,
    bottom: geometry.crop.bottom + additional.bottom,
  };
  const croppedWidth = geometry.codedWidth - bitstreamCrop.left - bitstreamCrop.right;
  const croppedHeight = geometry.codedHeight - bitstreamCrop.top - bitstreamCrop.bottom;
  if (croppedWidth < 2 || croppedHeight < 2) throw new Error('The crop removes the whole picture.');

  const sideways = geometry.rotation === 90 || geometry.rotation === 270;
  const previewMargins = onDisplay ? mapCodedMargins(additional, geometry.rotation) : additional;
  const output = sideways
    ? { width: croppedHeight, height: croppedWidth }
    : { width: croppedWidth, height: croppedHeight };
  const frameCrop = onDisplay
    ? { x: previewMargins.left, y: previewMargins.top, width: output.width, height: output.height }
    : {
        x: additional.left,
        y: additional.top,
        width: geometry.croppedWidth - additional.left - additional.right,
        height: geometry.croppedHeight - additional.top - additional.bottom,
      };
  return {
    codec: geometry.codec,
    previewMargins,
    output,
    bitstreamCrop,
    removesPixels: additional.left + additional.right + additional.top + additional.bottom > 0,
    // Chrome keeps the top-left of the coded picture. A top or left crop shrinks
    // the frame without moving those pixels, which leaves the bar and clips the
    // far edge. Those crops are written into the picture instead.
    method: bitstreamCrop.left > 0 || bitstreamCrop.top > 0 ? 'lossless' : 'copy',
    frameCrop,
    autorotate: onDisplay,
  };
}

export function cropArguments(plan: CropPlan): string[] {
  if (plan.method === 'lossless') return losslessArguments(plan);
  return copyArguments(plan.codec, plan.bitstreamCrop);
}

function copyArguments(codec: 'h264' | 'hevc', crop: Margins): string[] {
  const filter = codec === 'h264' ? 'h264_metadata' : 'hevc_metadata';
  const settings = `crop_left=${crop.left}:crop_right=${crop.right}:crop_top=${crop.top}:crop_bottom=${crop.bottom}`;
  return [
    '-i',
    'source.mp4',
    '-map',
    '0',
    '-c',
    'copy',
    '-bsf:v',
    `${filter}=${settings}`,
    '-movflags',
    '+faststart',
    'cropped.mp4',
  ];
}

function losslessArguments(plan: CropPlan): string[] {
  const { x, y, width, height } = plan.frameCrop;
  const args = ['-flags', 'unaligned'];
  if (!plan.autorotate) args.push('-noautorotate');
  args.push(
    '-i',
    'source.mp4',
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    `crop=${width}:${height}:${x}:${y}`,
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
  );
  return args;
}

function wholeMargins(margins: Margins): Margins {
  return {
    left: whole(margins.left),
    right: whole(margins.right),
    top: whole(margins.top),
    bottom: whole(margins.bottom),
  };
}

function whole(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function clampMargins(margins: Margins, width: number, height: number): Margins {
  const left = Math.min(margins.left, Math.max(0, width - 2));
  const top = Math.min(margins.top, Math.max(0, height - 2));
  return {
    left,
    top,
    right: Math.min(margins.right, Math.max(0, width - left - 2)),
    bottom: Math.min(margins.bottom, Math.max(0, height - top - 2)),
  };
}

function alignMargins(margins: Margins, unitX: number, unitY: number): Margins {
  const safeX = unitX > 0 ? unitX : 2;
  const safeY = unitY > 0 ? unitY : 2;
  return {
    left: margins.left - (margins.left % safeX),
    right: margins.right - (margins.right % safeX),
    top: margins.top - (margins.top % safeY),
    bottom: margins.bottom - (margins.bottom % safeY),
  };
}

export function emptyMargins(): Margins {
  return { ...ZERO_MARGINS };
}
