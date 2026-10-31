import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { describeError, PageRangeError } from '../core/errors';
import { ingestFiles, type LoadedDocument } from '../core/documents';
import { replaceDownload, type ReadyDownload } from '../core/download';
import { fileStem, formatBytes, formatPages, groupFileLabel, uniqueName } from '../core/names';
import { allPages, parsePageList, parsePageSelection } from '../core/page-range';
import { splitPdf } from '../core/pdf-tools';
import { PDF_ACCEPT } from '../core/sniff';
import { releaseDocuments } from '../core/thumbs';
import { zipNamedFiles } from '../core/zip-files';
import { ActionBar } from '../ui/action-bar';
import { inputText } from '../ui/dom';
import { DropZone } from '../ui/drop-zone';
import { Segmented, type SegmentOption } from '../ui/segmented';

type SplitMode = 'each' | 'ranges' | 'selected';

@Component({
  selector: 'app-split-pdf',
  imports: [DropZone, Segmented, ActionBar],
  templateUrl: './split-pdf.html',
})
export class SplitPdf {
  readonly accept = PDF_ACCEPT;
  readonly modes: readonly SegmentOption[] = [
    { id: 'each', label: 'Every page' },
    { id: 'ranges', label: 'Ranges' },
    { id: 'selected', label: 'Chosen pages' },
  ];

  readonly file = signal<LoadedDocument | null>(null);
  readonly mode = signal<SplitMode>('each');
  readonly ranges = signal('');
  readonly manual = signal('');
  readonly selected = signal<number[]>([]);
  readonly busy = signal(false);
  readonly progress = signal('');
  readonly error = signal('');
  readonly ready = signal<ReadyDownload | null>(null);
  private readonly anchor = signal(0);

  readonly pageCount = computed(() => this.file()?.pageCount ?? 0);
  readonly huge = computed(() => this.pageCount() > 600);
  readonly pageIndexes = computed(() =>
    Array.from({ length: Math.min(this.pageCount(), 600) }, (_, index) => index),
  );
  readonly selectedSet = computed(() => new Set(this.selected()));

  readonly status = computed(() => {
    const file = this.file();
    if (!file) return { error: '', hint: '' };
    const mode = this.mode();
    if (mode === 'ranges' && !this.ranges().trim()) {
      return { error: '', hint: 'Example: 1-3, 4-6, 10. Each range becomes its own PDF.' };
    }
    if (mode === 'selected' && this.huge() && !this.manual().trim()) {
      return {
        error: '',
        hint: 'This PDF is large, so type the pages to keep. Example: 1-10, 42.',
      };
    }
    if (mode === 'selected' && !this.huge() && !this.selected().length) {
      return { error: '', hint: 'Click pages to include them. Shift-click selects a span.' };
    }
    try {
      const groups = this.currentGroups(file);
      const hint =
        groups.length > 1
          ? `${groups.length} PDFs will be saved in one zip.`
          : 'This downloads as one PDF.';
      return { error: '', hint };
    } catch (caught) {
      return { error: describeError(caught), hint: '' };
    }
  });

  readonly canRun = computed(() => {
    const file = this.file();
    if (!file) return false;
    try {
      const groups = this.currentGroups(file);
      return groups.length > 0 && groups.every((group) => group.length > 0);
    } catch {
      return false;
    }
  });

  readonly summary = computed(() => {
    const file = this.file();
    if (!file) return '';
    return `${file.name} · ${formatPages(file.pageCount)} · ${formatBytes(file.size)}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release());
  }

  async add(incoming: File[]): Promise<void> {
    if (this.busy() || !incoming.length) return;
    this.busy.set(true);
    this.error.set('');
    const previous = this.file();
    const { documents, errors } = await ingestFiles(incoming, ['pdf'], {
      single: true,
      onProgress: (message) => this.progress.set(message),
    });
    const next = documents[0];
    if (next) {
      if (previous) releaseDocuments([previous]);
      this.file.set(next);
      this.selected.set([]);
      this.ranges.set('');
      this.manual.set('');
      this.anchor.set(0);
    }
    this.error.set(errors.join('\n'));
    this.busy.set(false);
    this.progress.set('');
  }

  clear(): void {
    const file = this.file();
    if (file) releaseDocuments([file]);
    this.file.set(null);
    this.selected.set([]);
    this.error.set('');
  }

  setMode(value: string): void {
    if (value === 'each' || value === 'ranges' || value === 'selected') this.mode.set(value);
  }

  setRanges(event: Event): void {
    this.ranges.set(inputText(event));
  }

  setManual(event: Event): void {
    this.manual.set(inputText(event));
  }

  isSelected(index: number): boolean {
    return this.selectedSet().has(index);
  }

  pick(index: number, event: MouseEvent): void {
    const current = new Set(this.selected());
    if (event.shiftKey) {
      const start = Math.min(this.anchor(), index);
      const end = Math.max(this.anchor(), index);
      for (let page = start; page <= end; page++) current.add(page);
    } else if (current.has(index)) {
      current.delete(index);
      this.anchor.set(index);
    } else {
      current.add(index);
      this.anchor.set(index);
    }
    this.selected.set([...current].sort((left, right) => left - right));
  }

  selectAll(): void {
    const count = this.pageCount();
    this.selected.set(allPages(Math.min(count, 600)));
  }

  clearSelection(): void {
    this.selected.set([]);
  }

  async run(filename: string): Promise<void> {
    const file = this.file();
    if (!file || !this.canRun() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const groups = this.currentGroups(file);
      this.progress.set('Splitting...');
      const outputs = await splitPdf(file.bytes, groups, (done, total) => {
        this.progress.set(`Saving ${done} of ${total}...`);
      });
      if (outputs.length === 1 && outputs[0]) {
        this.ready.set(replaceDownload(this.ready(), outputs[0], 'application/pdf', filename));
      } else {
        const used = new Set<string>();
        const stem = fileStem(file.name);
        const zipped = zipNamedFiles(
          outputs.map((data, index) => ({
            name: uniqueName(`${stem}-${groupFileLabel(groups[index] ?? [])}.pdf`, used),
            data,
          })),
        );
        const zipName = filename.replace(/\.pdf$/i, '.zip');
        this.ready.set(replaceDownload(this.ready(), zipped, 'application/zip', zipName));
      }
    } catch (caught) {
      this.error.set(describeError(caught));
    } finally {
      this.busy.set(false);
      this.progress.set('');
    }
  }

  private currentGroups(file: LoadedDocument): number[][] {
    if (this.mode() === 'each') return allPages(file.pageCount).map((index) => [index]);
    if (this.mode() === 'ranges') return parsePageSelection(this.ranges(), file.pageCount);
    if (this.huge()) {
      if (!this.manual().trim()) throw new PageRangeError('Enter the pages to keep.');
      return [parsePageList(this.manual(), file.pageCount)];
    }
    const picked = this.selected();
    if (!picked.length) throw new PageRangeError('Select at least one page.');
    return [picked];
  }

  private release(): void {
    const ready = this.ready();
    if (ready) URL.revokeObjectURL(ready.url);
    const file = this.file();
    if (file) releaseDocuments([file]);
  }
}
