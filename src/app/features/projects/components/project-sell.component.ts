import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';

/** "Sell to this project": the project's customer and the ways to sell, or why there is nothing to sell to. */
@Component({
  selector: 'app-project-sell',
  imports: [FeedbackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }

    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 17px / var(--md-lh) var(--md-font);
    }

    .note {
      margin: 0;
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
    }
  `,
  template: `
    <h2>{{ heading() }}</h2>
    @if (note(); as text) {
      <p class="note">{{ text }}</p>
    }
    @if (notice(); as card) {
      <app-feedback-card tone="warning" [title]="card.title" [message]="card.message" />
    }
    @if (quick(); as label) {
      <button type="button" class="md-btn md-btn--primary" (click)="quickSale.emit()">
        {{ label }}
      </button>
    }
    @if (supply(); as label) {
      <button type="button" class="md-btn" (click)="supplyProject.emit()">{{ label }}</button>
    }
    @if (addCustomer(); as label) {
      <button type="button" class="md-btn" (click)="addCustomerTo.emit()">{{ label }}</button>
    }
  `,
})
export class ProjectSellComponent {
  readonly heading = input.required<string>();
  readonly note = input<string | null>(null);
  readonly notice = input<{ title: string; message: string } | null>(null);
  readonly quick = input<string | null>(null);
  readonly supply = input<string | null>(null);
  readonly addCustomer = input<string | null>(null);
  readonly quickSale = output<void>();
  readonly supplyProject = output<void>();
  readonly addCustomerTo = output<void>();
}
