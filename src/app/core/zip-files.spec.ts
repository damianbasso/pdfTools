import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { zipNamedFiles } from './zip-files';

describe('zipNamedFiles', () => {
  it('packs files and renames collisions', () => {
    const zipped = zipNamedFiles([
      { name: 'page.pdf', data: new Uint8Array([1, 2, 3]) },
      { name: 'page.pdf', data: new Uint8Array([4]) },
    ]);
    const entries = unzipSync(zipped);
    expect(Object.keys(entries).sort()).toEqual(['page-2.pdf', 'page.pdf']);
    expect(Array.from(entries['page.pdf']!)).toEqual([1, 2, 3]);
  });
});
