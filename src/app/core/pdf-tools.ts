import { encode as encodePng } from 'fast-png';
import { PDFDocument } from 'pdf-lib';
import { yieldThread } from './async';
import { rgbaToRgb, type RasterPage } from './raster';

export type PaperSize = 'a4' | 'letter' | 'original';

export interface PdfMergeInput {
  bytes: Uint8Array;
  pageIndices?: number[];
}

export type PdfImageSource =
  { kind: 'jpeg'; data: Uint8Array } | { kind: 'rgba'; rgba: Uint8Array };

export interface PdfImagePage {
  width: number;
  height: number;
  dpiX?: number;
  dpiY?: number;
  source: PdfImageSource;
}

export interface PagePlacement {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const A4 = { width: 595.28, height: 841.89 };
const LETTER = { width: 612, height: 792 };
const MARGIN = 36;

export function placeImage(
  pixelWidth: number,
  pixelHeight: number,
  paper: PaperSize,
  dpiX = 72,
  dpiY = 72,
): PagePlacement {
  const safeDpiX = dpiX > 0 ? dpiX : 72;
  const safeDpiY = dpiY > 0 ? dpiY : 72;
  if (paper === 'original') {
    const pageWidth = (pixelWidth * 72) / safeDpiX;
    const pageHeight = (pixelHeight * 72) / safeDpiY;
    return { pageWidth, pageHeight, x: 0, y: 0, width: pageWidth, height: pageHeight };
  }

  const base = paper === 'letter' ? LETTER : A4;
  const landscape = pixelWidth > pixelHeight;
  const pageWidth = landscape ? base.height : base.width;
  const pageHeight = landscape ? base.width : base.height;
  const scale = Math.min(
    (pageWidth - MARGIN * 2) / pixelWidth,
    (pageHeight - MARGIN * 2) / pixelHeight,
  );
  const width = pixelWidth * scale;
  const height = pixelHeight * scale;
  return {
    pageWidth,
    pageHeight,
    width,
    height,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
  };
}

export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const document = await PDFDocument.load(bytes);
  return document.getPageCount();
}

export async function mergePdfFiles(
  inputs: readonly PdfMergeInput[],
  options?: { title?: string; onProgress?: (done: number, total: number) => void },
): Promise<Uint8Array> {
  if (!inputs.length) throw new Error('Add at least one PDF.');
  const out = await PDFDocument.create();
  out.setProducer('pdfTools');
  out.setCreator('pdfTools');
  if (options?.title) out.setTitle(options.title);

  for (let index = 0; index < inputs.length; index++) {
    options?.onProgress?.(index, inputs.length);
    const input = inputs[index];
    const source = await PDFDocument.load(input.bytes);
    const indices = input.pageIndices ?? source.getPageIndices();
    assertIndexes(indices, source.getPageCount());
    if (indices.length) {
      const pages = await out.copyPages(source, indices);
      for (const page of pages) out.addPage(page);
    }
    await yieldThread();
  }

  if (out.getPageCount() < 1) throw new Error('Nothing to merge. The selection has no pages.');
  options?.onProgress?.(inputs.length, inputs.length);
  return out.save();
}

export async function splitPdf(
  bytes: Uint8Array,
  groups: readonly (readonly number[])[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array[]> {
  if (!groups.length) throw new Error('Nothing to export.');
  const source = await PDFDocument.load(bytes);
  const pageCount = source.getPageCount();
  const outputs: Uint8Array[] = [];

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    if (!group.length) throw new Error('A range is empty.');
    assertIndexes(group, pageCount);
    const out = await PDFDocument.create();
    out.setProducer('pdfTools');
    out.setCreator('pdfTools');
    const pages = await out.copyPages(source, [...group]);
    for (const page of pages) out.addPage(page);
    outputs.push(await out.save());
    onProgress?.(index + 1, groups.length);
    await yieldThread();
  }

  return outputs;
}

export async function imagesToPdf(
  pages: readonly PdfImagePage[],
  options: { paper: PaperSize; title?: string; onProgress?: (done: number, total: number) => void },
): Promise<Uint8Array> {
  if (!pages.length) throw new Error('Add at least one image.');
  const pdf = await PDFDocument.create();
  pdf.setProducer('pdfTools');
  pdf.setCreator('pdfTools');
  if (options.title) pdf.setTitle(options.title);

  for (let index = 0; index < pages.length; index++) {
    options.onProgress?.(index, pages.length);
    const page = pages[index];
    const embedded =
      page.source.kind === 'jpeg'
        ? await pdf.embedJpg(page.source.data)
        : await pdf.embedPng(pngFromRgba(page));
    const pixelWidth = page.source.kind === 'jpeg' ? embedded.width : page.width;
    const pixelHeight = page.source.kind === 'jpeg' ? embedded.height : page.height;
    const placement = placeImage(pixelWidth, pixelHeight, options.paper, page.dpiX, page.dpiY);
    const pdfPage = pdf.addPage([placement.pageWidth, placement.pageHeight]);
    pdfPage.drawImage(embedded, {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    });
    await yieldThread();
  }

  options.onProgress?.(pages.length, pages.length);
  return pdf.save();
}

export function rasterToPdfPage(page: RasterPage): PdfImagePage {
  return {
    width: page.width,
    height: page.height,
    dpiX: page.dpiX,
    dpiY: page.dpiY,
    source: { kind: 'rgba', rgba: page.rgba },
  };
}

function pngFromRgba(page: PdfImagePage): Uint8Array {
  if (page.source.kind !== 'rgba') throw new Error('Expected raster image data.');
  if (page.source.rgba.length !== page.width * page.height * 4) {
    throw new Error('Image data does not match its dimensions.');
  }
  return encodePng({
    width: page.width,
    height: page.height,
    data: rgbaToRgb(page.source.rgba),
    depth: 8,
    channels: 3,
  });
}

function assertIndexes(indexes: readonly number[], pageCount: number): void {
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new Error('A page selection points past the end of a PDF.');
    }
  }
}
