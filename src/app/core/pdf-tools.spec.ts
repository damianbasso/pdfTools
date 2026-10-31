import { encode as encodeJpeg } from 'jpeg-js';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { imagesToPdf, mergePdfFiles, placeImage, splitPdf } from './pdf-tools';

async function pdfWithWidths(widths: number[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const width of widths) pdf.addPage([width, 40]);
  return pdf.save();
}

async function widthsOf(bytes: Uint8Array): Promise<number[]> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((page) => page.getWidth());
}

describe('pdf tools', () => {
  it('merges documents in order and can keep a subset of pages', async () => {
    const first = await pdfWithWidths([100, 110, 120]);
    const second = await pdfWithWidths([90]);
    const merged = await mergePdfFiles([{ bytes: first, pageIndices: [2, 0] }, { bytes: second }]);
    expect(await widthsOf(merged)).toEqual([120, 100, 90]);
  });

  it('splits a PDF into the requested groups', async () => {
    const source = await pdfWithWidths([10, 20, 30]);
    const parts = await splitPdf(source, [[0], [1, 2]]);
    expect(parts).toHaveLength(2);
    expect(await widthsOf(parts[0]!)).toEqual([10]);
    expect(await widthsOf(parts[1]!)).toEqual([20, 30]);
  });

  it('places images on paper and embeds raster pages', async () => {
    expect(placeImage(20, 10, 'a4').pageWidth).toBeCloseTo(841.89, 1);
    expect(placeImage(300, 300, 'original', 300, 300).pageWidth).toBeCloseTo(72, 2);

    const rgba = new Uint8Array(20 * 10 * 4);
    for (let index = 0; index < rgba.length; index += 4) {
      rgba[index] = 200;
      rgba[index + 3] = 255;
    }
    const pdfBytes = await imagesToPdf(
      [
        { width: 20, height: 10, source: { kind: 'rgba', rgba } },
        {
          width: 300,
          height: 150,
          dpiX: 300,
          dpiY: 300,
          source: { kind: 'rgba', rgba: new Uint8Array(300 * 150 * 4).fill(255) },
        },
      ],
      { paper: 'original' },
    );
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(20, 2);
    expect(pdf.getPage(1).getWidth()).toBeCloseTo(72, 2);
  });

  it('embeds a baseline JPEG', async () => {
    const data = new Uint8Array(2 * 2 * 4);
    data[0] = 255;
    data[3] = 255;
    const jpeg = encodeJpeg({ data, width: 2, height: 2 }, 80);
    const pdfBytes = await imagesToPdf(
      [{ width: 2, height: 2, source: { kind: 'jpeg', data: new Uint8Array(jpeg.data) } }],
      { paper: 'original' },
    );
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(2, 2);
  });
});
