import { Component, effect, input, output, signal } from '@angular/core';
import { downloadName } from '../core/names';
import { inputText } from './dom';

@Component({
  selector: 'app-action-bar',
  template: `
    <div class="action-bar">
      <label class="name-field">
        <span>Save as</span>
        <input
          type="text"
          [value]="name()"
          [disabled]="busy()"
          autocomplete="off"
          spellcheck="false"
          (input)="onName($event)"
          (keydown.enter)="emitRun()"
        />
      </label>
      <button type="button" class="primary" [disabled]="busy() || disabled()" (click)="emitRun()">
        {{ busy() ? progress() || 'Working...' : label() }}
      </button>
    </div>
    @if (hint()) {
      <p class="note">{{ hint() }}</p>
    }
  `,
})
export class ActionBar {
  readonly label = input.required<string>();
  readonly extension = input.required<string>();
  readonly fallback = input.required<string>();
  readonly busy = input(false);
  readonly disabled = input(false);
  readonly progress = input('');
  readonly hint = input('');
  readonly requested = output<string>();

  readonly name = signal('');
  private readonly edited = signal(false);

  constructor() {
    effect(() => {
      const fallback = this.fallback();
      if (!this.edited()) this.name.set(fallback);
    });
  }

  onName(event: Event): void {
    this.edited.set(true);
    this.name.set(inputText(event));
  }

  emitRun(): void {
    if (this.busy() || this.disabled()) return;
    this.requested.emit(downloadName(this.name(), this.extension(), this.fallback()));
  }
}
