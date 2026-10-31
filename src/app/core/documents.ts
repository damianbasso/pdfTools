import { yieldThread } from './async';
import { describeError } from './errors';
import { countPdfPages } from './pdf-tools';
import type { DocumentKind } from './sniff';
import { sniffDocument } from './sniff';
import { tiffSummary } from './tiff';

export interface LoadedDocument {
  id: string;
  name: string;
  size: number;
  kind: DocumentKind;
  bytes: Uint8Array;
  pageCount: number;
  pages: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
}

export function kindLabel(kind: DocumentKind): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'jpeg') return 'JPEG';
  if (kind === 'png') return 'PNG';
  return 'TIFF';
}

export async function inspectDocument(
  file: File,
  allowed: readonly DocumentKind[],
): Promise<LoadedDocument> {
  if (!file.size) throw new Error(`${file.name} is empty.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffDocument(bytes);
  if (kind === 'bigtiff') {
    throw new Error(`${file.name} is a BigTIFF file, which this editor cannot read.`);
  }
  if (kind === null || !allowed.includes(kind)) {
    throw new Error(`${file.name} is not a ${describeAllowed(allowed)}.`);
  }

  if (kind === 'pdf') {
    let pageCount = 0;
    try {
      pageCount = await countPdfPages(bytes);
    } catch (error) {
      throw new Error(`${file.name}: ${describeError(error)}`);
    }
    if (pageCount < 1) throw new Error(`${file.name} has no pages.`);
    return documentFrom(file, bytes, kind, pageCount);
  }

  if (kind === 'jpeg' || kind === 'png') return documentFrom(file, bytes, kind, 1);

  try {
    const summary = tiffSummary(bytes);
    return documentFrom(file, bytes, kind, summary.pageCount, summary.width, summary.height);
  } catch (error) {
    throw new Error(`${file.name}: ${describeError(error)}`);
  }
}

export async function ingestFiles(
  incoming: readonly File[],
  allowed: readonly DocumentKind[],
  options?: {
    single?: boolean;
    onProgress?: (message: string) => void;
    decorate?: (document: LoadedDocument) => Promise<LoadedDocument>;
  },
): Promise<{ documents: LoadedDocument[]; errors: string[] }> {
  const documents: LoadedDocument[] = [];
  const errors: string[] = [];
  const files = options?.single ? incoming.slice(0, 1) : [...incoming];
  if (options?.single && incoming.length > 1) {
    errors.push('This tool uses one PDF at a time. Loaded the first file.');
  }

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (!file) continue;
    options?.onProgress?.(`Reading ${file.name} (${index + 1} of ${files.length})`);
    await yieldThread();
    try {
      let document = await inspectDocument(file, allowed);
      if (options?.decorate) document = await options.decorate(document);
      documents.push(document);
    } catch (error) {
      errors.push(describeError(error));
    }
  }

  return { documents, errors };
}

function documentFrom(
  file: File,
  bytes: Uint8Array,
  kind: DocumentKind,
  pageCount: number,
  width?: number,
  height?: number,
): LoadedDocument {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    kind,
    bytes,
    pageCount,
    pages: '',
    width,
    height,
  };
}

function describeAllowed(allowed: readonly DocumentKind[]): string {
  const labels = allowed.map(kindLabel);
  if (labels.length <= 1) return `${labels[0] ?? 'supported'} file`;
  if (labels.length === 2) return `${labels[0]} or ${labels[1]} file`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]} file`;
}
