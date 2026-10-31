import { PageRangeError } from './errors';

export function allPages(pageCount: number): number[] {
  return Array.from({ length: pageCount }, (_, index) => index);
}

/** Parses a 1-based selection such as "1-3, 5" into groups of 0-based indexes. */
export function parsePageSelection(input: string, pageCount: number): number[][] {
  const trimmed = input.trim();
  if (!trimmed) throw new PageRangeError('Enter at least one page.');
  if (pageCount < 1) throw new PageRangeError('This PDF has no pages.');

  const groups = trimmed
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (!groups.length) throw new PageRangeError('Enter at least one page.');
  return groups.map((group) => parseGroup(group, pageCount));
}

/** Blank or "all" keeps every page. Otherwise groups are flattened in written order. */
export function parsePageList(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed || /^all$/i.test(trimmed)) return allPages(pageCount);
  return parsePageSelection(trimmed, pageCount).flat();
}

function parseGroup(group: string, pageCount: number): number[] {
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(group);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    assertPage(start, pageCount);
    assertPage(end, pageCount);
    const step = start <= end ? 1 : -1;
    const pages: number[] = [];
    for (let page = start; step > 0 ? page <= end : page >= end; page += step) {
      pages.push(page - 1);
    }
    return pages;
  }

  if (/^\d+$/.test(group)) {
    const page = Number(group);
    assertPage(page, pageCount);
    return [page - 1];
  }

  throw new PageRangeError(`"${group}" is not a page or range. Use numbers like 1-3 or 5.`);
}

function assertPage(page: number, pageCount: number): void {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new PageRangeError(
      pageCount === 1 ? 'Only page 1 is available.' : `Pages must be between 1 and ${pageCount}.`,
    );
  }
}
