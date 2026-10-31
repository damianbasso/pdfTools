import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  type CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, input, output } from '@angular/core';
import { inputText } from './dom';

export interface QueueRow {
  id: string;
  name: string;
  meta: string;
  badge: string;
  thumbUrl?: string;
  pages?: string;
  pagesError?: string | null;
}

@Component({
  selector: 'app-file-queue',
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './file-queue.html',
})
export class FileQueue {
  readonly rows = input.required<readonly QueueRow[]>();
  readonly showPages = input(false);
  readonly dragDisabled = input(false);
  readonly removed = output<string>();
  readonly moved = output<{ id: string; direction: -1 | 1 }>();
  readonly reordered = output<string[]>();
  readonly pagesChanged = output<{ id: string; pages: string }>();

  dropped(event: CdkDragDrop<readonly QueueRow[]>): void {
    const ids = this.rows().map((row) => row.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    this.reordered.emit(ids);
  }

  onPages(id: string, event: Event): void {
    this.pagesChanged.emit({ id, pages: inputText(event) });
  }
}
