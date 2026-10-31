import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { describeError } from '../core/errors';
import { ingestFiles, kindLabel, type LoadedDocument } from '../core/documents';
import { replaceDownload, type ReadyDownload } from '../core/download';
import { pdfPagesFromFiles } from '../core/image-pages';
import { moveById, reorderById } from '../core/list';
import { fileStem, formatBytes, formatPages } from '../core/names';
import { imagesToPdf, type PaperSize } from '../core/pdf-tools';
import { IMAGE_ACCEPT } from '../core/sniff';
import { decodeTiffPages } from '../core/tiff';
import { jpegThumbUrl, rasterDataUrl, releaseDocuments } from '../core/thumbs';
import { ActionBar } from '../ui/action-bar';
import { DropZone } from '../ui/drop-zone';
import { FileQueue, type QueueRow } from '../ui/file-queue';
import { Segmented, type SegmentOption } from '../ui/segmented';

@Component({
  selector: 'app-images-to-pdf',
  imports: [DropZone, FileQueue, Segmented, ActionBar],
  templateUrl: './images-to-pdf.html',
})
export class ImagesToPdf {
  readonly accept = IMAGE_ACCEPT;
  readonly papers: readonly SegmentOption[] = [
    { id: 'a4', label: 'A4' },
    { id: 'letter', label: 'US Letter' },
    { id: 'original', label: 'Original size' },
  ];

  readonly files = signal<LoadedDocument[]>([]);
  readonly paper = signal<PaperSize>('a4');
  readonly busy = signal(false);
  readonly progress = signal('');
  readonly error = signal('');
  readonly ready = signal<ReadyDownload | null>(null);

  readonly rows = computed<QueueRow[]>(() =>
    this.files().map((file) => ({
      id: file.id,
      name: file.name,
      badge: kindLabel(file.kind),
      meta: `${formatPages(file.pageCount)} · ${formatBytes(file.size)}`,
      thumbUrl: file.thumbUrl,
    })),
  );

  readonly pageTotal = computed(() => this.files().reduce((sum, file) => sum + file.pageCount, 0));
  readonly canRun = computed(() => this.files().length > 0);

  readonly hint = computed(() => {
    if (!this.files().length) return 'Each JPEG is one page. Every page inside a TIFF is included.';
    const heavy = this.files().reduce((sum, file) => sum + file.size, 0) > 80 * 1024 * 1024;
    const size =
      this.paper() === 'original'
        ? 'Original size uses the file resolution when it has one.'
        : 'Pages rotate to match each picture.';
    const memory = heavy
      ? ' These files are large and stay in memory while they are processed.'
      : '';
    return `${formatPages(this.pageTotal())} in the order shown. ${size}${memory}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release());
  }

  async add(incoming: File[]): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    const { documents, errors } = await ingestFiles(incoming, ['jpeg', 'tiff'], {
      onProgress: (message) => this.progress.set(message),
      decorate: (document) => this.decorate(document),
    });
    this.files.update((files) => [...files, ...documents]);
    this.error.set(errors.join('\n'));
    this.busy.set(false);
    this.progress.set('');
  }

  remove(id: string): void {
    const file = this.files().find((item) => item.id === id);
    releaseDocuments(file ? [file] : []);
    this.files.update((files) => files.filter((item) => item.id !== id));
  }

  reorder(ids: string[]): void {
    this.files.update((files) => reorderById(files, ids));
  }

  move(change: { id: string; direction: -1 | 1 }): void {
    this.files.update((files) => moveById(files, change.id, change.direction));
  }

  clear(): void {
    releaseDocuments(this.files());
    this.files.set([]);
    this.error.set('');
  }

  setPaper(value: string): void {
    if (value === 'a4' || value === 'letter' || value === 'original') this.paper.set(value);
  }

  async run(filename: string): Promise<void> {
    if (!this.canRun() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.progress.set('Reading images...');
      const pages = await pdfPagesFromFiles(this.files());
      const bytes = await imagesToPdf(pages, {
        paper: this.paper(),
        title: fileStem(filename),
        onProgress: (done, total) => this.progress.set(`Placing page ${done} of ${total}...`),
      });
      this.ready.set(replaceDownload(this.ready(), bytes, 'application/pdf', filename));
    } catch (caught) {
      this.error.set(describeError(caught));
    } finally {
      this.busy.set(false);
      this.progress.set('');
    }
  }

  private async decorate(document: LoadedDocument): Promise<LoadedDocument> {
    if (document.kind === 'jpeg') return { ...document, thumbUrl: jpegThumbUrl(document.bytes) };
    if (document.kind !== 'tiff' || !document.width || !document.height) return document;
    if (document.width * document.height > 2_000_000) return document;
    try {
      const first = decodeTiffPages(document.bytes, { firstOnly: true })[0];
      if (!first) return document;
      return { ...document, thumbUrl: rasterDataUrl(first) };
    } catch {
      return document;
    }
  }

  private release(): void {
    const ready = this.ready();
    if (ready) URL.revokeObjectURL(ready.url);
    releaseDocuments(this.files());
  }
}
