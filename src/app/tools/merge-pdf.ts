import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { yieldThread } from '../core/async';
import { describeError } from '../core/errors';
import { ingestFiles, kindLabel, type LoadedDocument } from '../core/documents';
import { replaceDownload, type ReadyDownload } from '../core/download';
import { moveById, reorderById } from '../core/list';
import { formatBytes, formatPages, fileStem } from '../core/names';
import { parsePageList } from '../core/page-range';
import { mergePdfFiles } from '../core/pdf-tools';
import { PDF_ACCEPT } from '../core/sniff';
import { releaseDocuments } from '../core/thumbs';
import { ActionBar } from '../ui/action-bar';
import { DropZone } from '../ui/drop-zone';
import { FileQueue, type QueueRow } from '../ui/file-queue';

@Component({
  selector: 'app-merge-pdf',
  imports: [DropZone, FileQueue, ActionBar],
  templateUrl: './merge-pdf.html',
})
export class MergePdf {
  readonly accept = PDF_ACCEPT;
  readonly files = signal<LoadedDocument[]>([]);
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
      pages: file.pages,
      pagesError: this.pageProblem(file),
    })),
  );

  readonly totalPages = computed(() =>
    this.files().reduce((sum, file) => {
      try {
        return sum + parsePageList(file.pages, file.pageCount).length;
      } catch {
        return sum;
      }
    }, 0),
  );

  readonly canRun = computed(
    () => this.files().length >= 2 && this.files().every((file) => this.pageProblem(file) === null),
  );

  readonly hint = computed(() => {
    if (!this.files().length)
      return 'Add two or more PDFs. Leave Pages blank, or limit them with 1-3, 5.';
    if (this.files().length === 1) return 'Add another PDF to merge.';
    if (!this.canRun()) return 'Leave Pages blank to keep every page. Example: 1-3, 5.';
    const heavy = this.files().reduce((sum, file) => sum + file.size, 0) > 80 * 1024 * 1024;
    const sizeNote = heavy
      ? ' These files are large and stay in memory while they are processed.'
      : '';
    return `${formatPages(this.totalPages())} will be copied into one PDF.${sizeNote}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release());
  }

  async add(incoming: File[]): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    const { documents, errors } = await ingestFiles(incoming, ['pdf'], {
      onProgress: (message) => this.progress.set(message),
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

  setPages(change: { id: string; pages: string }): void {
    this.files.update((files) =>
      files.map((file) => (file.id === change.id ? { ...file, pages: change.pages } : file)),
    );
  }

  clear(): void {
    releaseDocuments(this.files());
    this.files.set([]);
    this.error.set('');
  }

  async run(filename: string): Promise<void> {
    if (!this.canRun() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const inputs = this.files().map((file) => ({
        bytes: file.bytes,
        pageIndices: parsePageList(file.pages, file.pageCount),
      }));
      this.progress.set('Merging PDFs...');
      await yieldThread();
      const bytes = await mergePdfFiles(inputs, {
        title: fileStem(filename),
        onProgress: (done, total) => this.progress.set(`Merging ${done} of ${total}...`),
      });
      this.ready.set(replaceDownload(this.ready(), bytes, 'application/pdf', filename));
    } catch (error) {
      this.error.set(describeError(error));
    } finally {
      this.busy.set(false);
      this.progress.set('');
    }
  }

  private pageProblem(file: LoadedDocument): string | null {
    if (!file.pages.trim()) return null;
    try {
      parsePageList(file.pages, file.pageCount);
      return null;
    } catch (error) {
      return describeError(error);
    }
  }

  private release(): void {
    const ready = this.ready();
    if (ready) URL.revokeObjectURL(ready.url);
    releaseDocuments(this.files());
  }
}
