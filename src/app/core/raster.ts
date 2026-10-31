export interface RasterPage {
  rgba: Uint8Array;
  width: number;
  height: number;
  dpiX?: number;
  dpiY?: number;
}

export interface Rational {
  numerator: number;
  denominator: number;
}

/** Composite RGBA onto white and drop the alpha channel. */
export function rgbaToRgb(rgba: Uint8Array): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    const alpha = rgba[source + 3];
    const inverse = 255 - alpha;
    rgb[target] = ((rgba[source] * alpha + 255 * inverse + 127) / 255) | 0;
    rgb[target + 1] = ((rgba[source + 1] * alpha + 255 * inverse + 127) / 255) | 0;
    rgb[target + 2] = ((rgba[source + 2] * alpha + 255 * inverse + 127) / 255) | 0;
  }
  return rgb;
}

export function toRational(value: number): Rational {
  if (!Number.isFinite(value) || value <= 0) return { numerator: 72, denominator: 1 };
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.01) return { numerator: Math.max(1, rounded), denominator: 1 };
  return { numerator: Math.max(1, Math.round(value * 100)), denominator: 100 };
}

/**
 * Turns stored TIFF pixels into display order.
 * Orientation follows the TIFF/EXIF tag: 1 is upright, 6 is 90 degrees clockwise.
 */
export function applyTiffOrientation(
  rgba: Uint8Array,
  width: number,
  height: number,
  orientation = 1,
): { rgba: Uint8Array; width: number; height: number } {
  if (orientation < 2 || orientation > 8) return { rgba, width, height };

  const swap = orientation >= 5;
  const outWidth = swap ? height : width;
  const outHeight = swap ? width : height;
  const out = new Uint8Array(outWidth * outHeight * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx = x;
      let ny = y;
      switch (orientation) {
        case 2:
          nx = width - 1 - x;
          break;
        case 3:
          nx = width - 1 - x;
          ny = height - 1 - y;
          break;
        case 4:
          ny = height - 1 - y;
          break;
        case 5:
          nx = y;
          ny = x;
          break;
        case 6:
          nx = height - 1 - y;
          ny = x;
          break;
        case 7:
          nx = height - 1 - y;
          ny = width - 1 - x;
          break;
        case 8:
          nx = y;
          ny = width - 1 - x;
          break;
        default:
          break;
      }
      const sourceIndex = (y * width + x) * 4;
      const targetIndex = (ny * outWidth + nx) * 4;
      out[targetIndex] = rgba[sourceIndex];
      out[targetIndex + 1] = rgba[sourceIndex + 1];
      out[targetIndex + 2] = rgba[sourceIndex + 2];
      out[targetIndex + 3] = rgba[sourceIndex + 3];
    }
  }

  return { rgba: out, width: outWidth, height: outHeight };
}
