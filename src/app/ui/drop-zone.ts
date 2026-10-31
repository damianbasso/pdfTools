import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-drop-zone',
  template: `
    <label
      class="drop"
      [class.hot]="hot()"
      [class.is-disabled]="disabled()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <input
        type="file"
        [attr.accept]="accept()"
        [multiple]="multiple()"
        [disabled]="disabled()"
        (change)="onPick($event)"
      />
      <svg class="drop-icon" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="8" y="7" width="20" height="26" rx="2"></rect>
        <rect x="16" y="13" width="20" height="26" rx="2"></rect>
        <path d="M26 22v10M21 27l5 5 5-5"></path>
      </svg>
      <span class="drop-title">{{ title() }}</span>
      <span class="drop-hint">{{ hint() }}</span>
    </label>
  `,
})
export class DropZone {
  readonly accept = input.required<string>();
  readonly multiple = input(true);
  readonly title = input('Drop files here');
  readonly hint = input('or click to browse');
  readonly disabled = input(false);
  readonly chosen = output<File[]>();
  readonly hot = signal(false);

  onDragOver(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.hot.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.hot.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.hot.set(false);
    if (this.disabled()) return;
    const files = event.dataTransfer?.files;
    if (files?.length) this.chosen.emit(Array.from(files));
  }

  onPick(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.files?.length) return;
    this.chosen.emit(Array.from(target.files));
    target.value = '';
  }
}
