import UTIFImport from 'utif';
import { zlibSync } from 'fflate';
import type { TiffIfd, UtifApi } from 'utif';
import { copyBuffer } from './bytes';
import { applyTiffOrientation, rgbaToRgb, toRational, type RasterPage } from './raster';
import { isBigTiff, isTiff } from './sniff';

const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TAG_COUNT = 15;
const IFD_BYTES = 2 + TAG_COUNT * 12 + 4;
const EXTRA_BYTES = 22;
const DIRECTORY_BYTES = IFD_BYTES + EXTRA_BYTES;

export interface TiffPageInput {
  rgba: Uint8Array;
  width: number;
  height: number;
  dpiX?: number;
  dpiY?: number;
  /** Stored as TIFF tag 274. Pixel data is written unchanged. */
  orientation?: number;
}

export interface TiffSummary {
  pageCount: number;
  width: number;
  height: number;
}

interface PreparedPage {
  width: number;
  height: number;
  strip: Uint8Array;
  compression: 1 | 8;
  orientation: number;
  xNumerator: number;
  xDenominator: number;
  yNumerator: number;
  yDenominator: number;
  dataOffset: number;
}

const UTIF = resolveUtif(UTIFImport);

export function tiffSummary(data: Uint8Array): TiffSummary {
  const { pages } = openTiff(data);
  const first = pages[0];
  return {
    pageCount: pages.length,
    width: first?.t256?.[0] ?? 0,
    height: first?.t257?.[0] ?? 0,
  };
}

export function decodeTiffPages(data: Uint8Array, options?: { firstOnly?: boolean }): RasterPage[] {
  const { buffer, all, pages } = openTiff(data);
  const selected = options?.firstOnly ? pages.slice(0, 1) : pages;
  return selected.map((ifd, index) => decodePage(buffer, ifd, all, index));
}

export function encodeMultiPageTiff(pages: readonly TiffPageInput[]): Uint8Array {
  if (!pages.length) throw new Error('Add at least one image.');

  const prepared: PreparedPage[] = [];
  let cursor = 8 + pages.length * DIRECTORY_BYTES;
  for (const page of pages) {
    if (
      !Number.isInteger(page.width) ||
      !Number.isInteger(page.height) ||
      page.width < 1 ||
      page.height < 1
    ) {
      throw new Error('Each TIFF page needs a positive width and height.');
    }
    if (page.rgba.length !== page.width * page.height * 4) {
      throw new Error('Image data does not match its dimensions.');
    }
    const rgb = rgbaToRgb(page.rgba);
    const compressed = zlibSync(rgb, { level: 6 });
    const useDeflate = compressed.byteLength + 32 < rgb.byteLength;
    const strip = useDeflate ? compressed : rgb;
    const xResolution = toRational(page.dpiX ?? 72);
    const yResolution = toRational(page.dpiY ?? page.dpiX ?? 72);
    const orientation = page.orientation ?? 1;
    prepared.push({
      width: page.width,
      height: page.height,
      strip,
      compression: useDeflate ? 8 : 1,
      orientation: orientation >= 1 && orientation <= 8 ? orientation : 1,
      xNumerator: xResolution.numerator,
      xDenominator: xResolution.denominator,
      yNumerator: yResolution.numerator,
      yDenominator: yResolution.denominator,
      dataOffset: cursor,
    });
    cursor += strip.byteLength;
  }

  const buffer = new ArrayBuffer(cursor);
  const out = new Uint8Array(buffer);
  const view = new DataView(buffer);
  out[0] = 0x49;
  out[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  prepared.forEach((page, index) => {
    const ifdOffset = 8 + index * DIRECTORY_BYTES;
    const extraOffset = ifdOffset + IFD_BYTES;
    const nextIfd = index < prepared.length - 1 ? ifdOffset + DIRECTORY_BYTES : 0;
    view.setUint16(ifdOffset, TAG_COUNT, true);

    const tags = [
      [254, TYPE_LONG, 1, index === 0 ? 0 : 2],
      [256, TYPE_LONG, 1, page.width],
      [257, TYPE_LONG, 1, page.height],
      [258, TYPE_SHORT, 3, extraOffset],
      [259, TYPE_SHORT, 1, page.compression],
      [262, TYPE_SHORT, 1, 2],
      [273, TYPE_LONG, 1, page.dataOffset],
      [274, TYPE_SHORT, 1, page.orientation],
      [277, TYPE_SHORT, 1, 3],
      [278, TYPE_LONG, 1, page.height],
      [279, TYPE_LONG, 1, page.strip.byteLength],
      [282, TYPE_RATIONAL, 1, extraOffset + 6],
      [283, TYPE_RATIONAL, 1, extraOffset + 14],
      [284, TYPE_SHORT, 1, 1],
      [296, TYPE_SHORT, 1, 2],
    ] as const;

    let entry = ifdOffset + 2;
    for (const [id, type, count, value] of tags) {
      view.setUint16(entry, id, true);
      view.setUint16(entry + 2, type, true);
      view.setUint32(entry + 4, count, true);
      view.setUint32(entry + 8, value, true);
      entry += 12;
    }
    view.setUint32(entry, nextIfd, true);

    view.setUint16(extraOffset, 8, true);
    view.setUint16(extraOffset + 2, 8, true);
    view.setUint16(extraOffset + 4, 8, true);
    view.setUint32(extraOffset + 6, page.xNumerator, true);
    view.setUint32(extraOffset + 10, page.xDenominator, true);
    view.setUint32(extraOffset + 14, page.yNumerator, true);
    view.setUint32(extraOffset + 18, page.yDenominator, true);
    out.set(page.strip, page.dataOffset);
  });

  return out;
}

function openTiff(data: Uint8Array): { buffer: ArrayBuffer; all: TiffIfd[]; pages: TiffIfd[] } {
  if (isBigTiff(data)) {
    throw new Error('BigTIFF files are not supported. Export a standard TIFF and try again.');
  }
  if (!isTiff(data)) throw new Error('This file is not a TIFF image.');

  const buffer = copyBuffer(data);
  let all: TiffIfd[];
  try {
    all = UTIF.decode(buffer);
  } catch {
    throw new Error('Could not read this TIFF.');
  }
  const pages = pageIfds(all);
  if (!pages.length) throw new Error('This TIFF has no pages.');
  return { buffer, all, pages };
}

function decodePage(buffer: ArrayBuffer, ifd: TiffIfd, all: TiffIfd[], index: number): RasterPage {
  try {
    UTIF.decodeImage(buffer, ifd, all);
    const width = ifd.width || ifd.t256?.[0] || 0;
    const height = ifd.height || ifd.t257?.[0] || 0;
    const rgba = UTIF.toRGBA8(ifd);
    if (!width || !height || rgba.length !== width * height * 4) {
      throw new Error('empty');
    }
    const orientation = ifd.t274?.[0] ?? 1;
    const oriented = applyTiffOrientation(rgba, width, height, orientation);
    const dpi = dpiFromIfd(ifd);
    const swap = orientation >= 5 && orientation <= 8;
    return {
      rgba: oriented.rgba,
      width: oriented.width,
      height: oriented.height,
      dpiX: swap ? (dpi.y ?? dpi.x) : dpi.x,
      dpiY: swap ? (dpi.x ?? dpi.y) : dpi.y,
    };
  } catch {
    throw new Error(`Could not decode page ${index + 1} of this TIFF.`);
  }
}

function pageIfds(ifds: readonly TiffIfd[]): TiffIfd[] {
  const images = ifds.filter((ifd) => (ifd.t256?.[0] ?? 0) > 0 && (ifd.t257?.[0] ?? 0) > 0);
  const full = images.filter((ifd) => !isReducedResolution(ifd));
  return full.length ? full : images;
}

function isReducedResolution(ifd: TiffIfd): boolean {
  const modern = ifd.t254?.[0];
  if (typeof modern === 'number' && (modern & 1) === 1) return true;
  return ifd.t255?.[0] === 2;
}

function dpiFromIfd(ifd: TiffIfd): { x?: number; y?: number } {
  const unit = ifd.t296?.[0] ?? 2;
  const convert = (value: number | undefined): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
    if (unit === 2) return value;
    if (unit === 3) return value * 2.54;
    return undefined;
  };
  return { x: convert(ifd.t282?.[0]), y: convert(ifd.t283?.[0]) };
}

function resolveUtif(value: unknown): UtifApi {
  if (isUtif(value)) return value;
  if (isRecord(value) && 'default' in value && isUtif(value['default'])) return value['default'];
  throw new Error('The TIFF decoder failed to load.');
}

function isUtif(value: unknown): value is UtifApi {
  if (!isRecord(value)) return false;
  return (
    typeof value['decode'] === 'function' &&
    typeof value['decodeImage'] === 'function' &&
    typeof value['toRGBA8'] === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
