import { zipSync } from 'fflate';
import { uniqueName } from './names';

export function zipNamedFiles(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  if (!files.length) throw new Error('Nothing to zip.');
  const used = new Set<string>();
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[uniqueName(file.name, used)] = file.data;
  }
  return zipSync(entries, { level: 6 });
}
