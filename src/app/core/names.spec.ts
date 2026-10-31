import { describe, expect, it } from 'vitest';
import {
  downloadName,
  fileStem,
  formatBytes,
  formatPages,
  groupFileLabel,
  uniqueName,
} from './names';

describe('file names', () => {
  it('formats sizes and page counts', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatPages(1)).toBe('1 page');
    expect(formatPages(4)).toBe('4 pages');
  });

  it('builds a safe download name with the requested extension', () => {
    expect(downloadName('Quarterly report', '.pdf', 'merged.pdf')).toBe('Quarterly report.pdf');
    expect(downloadName('report.pdf', '.zip', 'split.zip')).toBe('report.zip');
    expect(downloadName('bad:/name', '.tif', 'combined.tif')).toBe('badname.tif');
    expect(downloadName('   ', '.pdf', 'merged.pdf')).toBe('merged.pdf');
    expect(downloadName('clip.mov', '.mp4', 'cropped.mp4')).toBe('clip.mp4');
    expect(fileStem('scans\\page.tiff')).toBe('page');
  });

  it('keeps zip entry names unique and describes page groups', () => {
    const used = new Set<string>();
    expect(uniqueName('page.pdf', used)).toBe('page.pdf');
    expect(uniqueName('page.pdf', used)).toBe('page-2.pdf');
    expect(groupFileLabel([0])).toBe('page-01');
    expect(groupFileLabel([0, 1, 2])).toBe('pages-1-3');
    expect(groupFileLabel([4, 3])).toBe('pages-5-4');
    expect(groupFileLabel([0, 2])).toBe('pages-1-set');
  });
});
