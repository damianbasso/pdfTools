import { Component, input, output } from '@angular/core';

export interface SegmentOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-segmented',
  template: `
    <div class="segmented" role="radiogroup" [attr.aria-label]="label()">
      @for (option of options(); track option.id) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="value() === option.id"
          [class.on]="value() === option.id"
          (click)="picked.emit(option.id)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class Segmented {
  readonly label = input.required<string>();
  readonly options = input.required<readonly SegmentOption[]>();
  readonly value = input.required<string>();
  readonly picked = output<string>();
}
