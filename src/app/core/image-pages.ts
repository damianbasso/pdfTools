import { PDFDocument } from 'pdf-lib';
import { yieldThread } from './async';
import { describeError } from './errors';
import type { LoadedDocument } from './documents';
import { jpegNeedsRaster, readJpegDpi } from './jpeg-info';
import { rasterToPdfPage, type PdfImagePage } from './pdf-tools';
import type { RasterPage } from './raster';
import { decodeBrowserImage } from './thumbs';
import { decodeTiffPages } from './tiff';

export async function rasterPagesFromFiles(
  files: readonly LoadedDocument[],
): Promise<RasterPage[]> {
  const pages: RasterPage[] = [];
  for (const file of files) {
    try {
      if (file.kind === 'tiff') {
        pages.push(...decodeTiffPages(file.bytes));
      } else if (file.kind === 'jpeg') {
        const raster = await decodeBrowserImage(file.bytes);
        const dpi = readJpegDpi(file.bytes);
        pages.push({ ...raster, dpiX: dpi?.x, dpiY: dpi?.y });
      }
    } catch (error) {
      throw new Error(`${file.name}: ${describeError(error)}`);
    }
    await yieldThread();
  }
  return pages;
}

export async function pdfPagesFromFiles(files: readonly LoadedDocument[]): Promise<PdfImagePage[]> {
  const pages: PdfImagePage[] = [];
  for (const file of files) {
    try {
      if (file.kind === 'tiff') {
        pages.push(...decodeTiffPages(file.bytes).map(rasterToPdfPage));
      } else if (file.kind === 'jpeg') {
        pages.push(await jpegPdfPage(file.bytes));
      }
    } catch (error) {
      throw new Error(`${file.name}: ${describeError(error)}`);
    }
    await yieldThread();
  }
  return pages;
}

async function jpegPdfPage(bytes: Uint8Array): Promise<PdfImagePage> {
  const dpi = readJpegDpi(bytes);
  if (!jpegNeedsRaster(bytes)) {
    try {
      const probe = await PDFDocument.create();
      const image = await probe.embedJpg(bytes);
      return {
        width: image.width,
        height: image.height,
        dpiX: dpi?.x,
        dpiY: dpi?.y,
        source: { kind: 'jpeg', data: bytes },
      };
    } catch {
      // Some JPEGs cannot be embedded directly. A raster copy still prints.
    }
  }
  const raster = await decodeBrowserImage(bytes);
  return {
    width: raster.width,
    height: raster.height,
    dpiX: dpi?.x,
    dpiY: dpi?.y,
    source: { kind: 'rgba', rgba: raster.rgba },
  };
}
