import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/** "Add receipt photo": takes a photo or picks an image, and shows the chosen file with a way to remove it. */
@Component({
  selector: 'app-receipt-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 8px;
    }

    input {
      display: none;
    }

    .chosen {
      margin: 0;
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
      overflow-wrap: anywhere;
    }
  `,
  template: `
    <input
      #file
      type="file"
      accept="image/*"
      capture="environment"
      [attr.aria-label]="addLabel()"
      (change)="choose($event)"
    />
    <button type="button" class="md-btn" (click)="file.click()">
      {{ fileName() ? changeLabel() : addLabel() }}
    </button>
    @if (fileName()) {
      <p class="chosen">{{ chosenLabel() }}</p>
      <button type="button" class="md-btn" (click)="removed.emit()">
        {{ removeLabel() }}
      </button>
    }
  `,
})
export class ReceiptPickerComponent {
  readonly addLabel = input.required<string>();
  readonly changeLabel = input.required<string>();
  readonly removeLabel = input.required<string>();
  /** "Receipt: photo.jpg" for the chosen file. */
  readonly chosenLabel = input<string>('');
  readonly fileName = input<string | null>(null);
  readonly picked = output<File>();
  readonly removed = output<void>();

  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('file');

  protected choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.picked.emit(file);
    }
    // Cleared so picking the same photo again still counts as a change.
    this.file().nativeElement.value = '';
  }
}
