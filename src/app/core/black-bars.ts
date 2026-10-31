export interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ContentBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const ZERO_MARGINS: Margins = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Bounding box of pixels brighter than `threshold`.
 * A row or column counts only when more than half a percent of it is bright,
 * so a speck in an otherwise black bar does not keep the bar.
 */
export function contentBox(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  threshold: number,
): ContentBox | null {
  if (width < 2 || height < 2 || rgba.length < width * height * 4) return null;
  const rowHits = new Uint32Array(height);
  const colHits = new Uint32Array(width);
  const rowNeed = Math.max(2, Math.floor(width * 0.005));
  const colNeed = Math.max(2, Math.floor(height * 0.005));

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const index = row + x * 4;
      const luma =
        ((rgba[index] ?? 0) * 54 + (rgba[index + 1] ?? 0) * 183 + (rgba[index + 2] ?? 0) * 19) >> 8;
      if (luma > threshold) {
        rowHits[y] += 1;
        colHits[x] += 1;
      }
    }
  }

  let top = 0;
  while (top < height && rowHits[top]! < rowNeed) top += 1;
  let bottom = height;
  while (bottom > top && rowHits[bottom - 1]! < rowNeed) bottom -= 1;
  let left = 0;
  while (left < width && colHits[left]! < colNeed) left += 1;
  let right = width;
  while (right > left && colHits[right - 1]! < colNeed) right -= 1;
  if (right - left < 2 || bottom - top < 2) return null;
  return { left, top, right, bottom };
}

/** Margins of the union of content boxes. Bars must be black in every sample. */
export function marginsAround(
  boxes: readonly ContentBox[],
  width: number,
  height: number,
): Margins {
  if (!boxes.length || width < 2 || height < 2) return { ...ZERO_MARGINS };
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (const box of boxes) {
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }
  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    right: Math.max(0, width - right),
    bottom: Math.max(0, height - bottom),
  };
}
