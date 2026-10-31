import { describe, expect, it } from 'vitest';
import { describeError, PageRangeError } from './errors';
import { parsePageList, parsePageSelection } from './page-range';

describe('page ranges', () => {
  it('parses ranges, single pages, and descending spans', () => {
    expect(parsePageSelection('1-3, 5, 8-6', 10)).toEqual([[0, 1, 2], [4], [7, 6, 5]]);
    expect(parsePageList('all', 3)).toEqual([0, 1, 2]);
    expect(parsePageList('  ', 2)).toEqual([0, 1]);
    expect(parsePageList('1, 1, 2', 4)).toEqual([0, 0, 1]);
  });

  it('rejects pages outside the document', () => {
    expect(() => parsePageSelection('0', 3)).toThrow(PageRangeError);
    expect(() => parsePageSelection('4', 3)).toThrow(/between 1 and 3/);
    expect(() => parsePageSelection('1-', 3)).toThrow(/not a page/);
    expect(parsePageList('', 0)).toEqual([]);
  });

  it('rewrites encrypted PDF errors', () => {
    expect(describeError(new Error('Input document is encrypted'))).toMatch(/password-protected/);
    expect(describeError(new PageRangeError('Only page 1 is available.'))).toBe(
      'Only page 1 is available.',
    );
  });
});
