import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideChevronRight } from '@lucide/angular';

export interface MoneyCardView {
  moneyIn: string;
  moneyOut: string;
  net: string;
  accounts: readonly { name: string; moneyIn: string; moneyOut: string }[];
  bars: readonly {
    label: string;
    moneyIn: string;
    moneyOut: string;
    inShare: number;
    outShare: number;
  }[];
}

export interface MoneyCardText {
  moneyIn: string;
  moneyOut: string;
  net: string;
  byAccount: string;
  in: string;
  out: string;
  noAccounts: string;
  lastMonths: string;
  link: string;
}

/** Money in and out: totals and the net, each payment account, and bars for recent months. */
@Component({
  selector: 'app-money-card',
  imports: [LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
    }

    .totals {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .label,
    .muted {
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
    }

    .figure {
      display: grid;
      gap: 2px;
    }

    .figure bdi {
      color: var(--md-primary);
      font: 700 20px / var(--md-lh) var(--md-font);
    }

    .net,
    .account {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    .net bdi {
      color: var(--md-primary);
      font-weight: 600;
    }

    .section {
      display: grid;
      gap: 6px;
      padding-block-start: 12px;
      border-block-start: 1px solid var(--md-line);
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr auto auto;
      column-gap: 24px;
      row-gap: 6px;
      align-items: baseline;
    }

    .grid .head {
      color: var(--md-ink);
      font: 600 12px / var(--md-lh) var(--md-font);
    }

    .grid .num {
      text-align: end;
      font-weight: 600;
    }

    .legend {
      display: flex;
      gap: 16px;
    }

    .swatch {
      display: inline-block;
      inline-size: 10px;
      block-size: 10px;
      margin-inline-end: 6px;
      border-radius: 2px;
      vertical-align: middle;
    }

    .in {
      background: var(--md-primary);
    }

    .out {
      background: var(--md-muted);
    }

    .month {
      display: grid;
      grid-template-columns: 56px 1fr;
      gap: 8px;
      align-items: center;
    }

    .bars {
      display: grid;
      gap: 4px;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 6px;
      font: 400 11px / 1 var(--md-font);
      color: var(--md-muted);
    }

    .bar span:first-child {
      block-size: 10px;
      border-radius: 2px;
    }

    button {
      all: unset;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-block-start: 12px;
      border-block-start: 1px solid var(--md-line);
      color: var(--md-primary);
      font: 600 15px / var(--md-lh) var(--md-font);
      cursor: pointer;
    }

    button:focus-visible {
      outline: 2px solid var(--md-primary);
      outline-offset: 2px;
    }

    :host-context([dir='rtl']) svg {
      transform: scaleX(-1);
    }
  `,
  template: `
    @let v = view();
    @let t = text();
    <div class="totals">
      <div class="figure">
        <span class="label">{{ t.moneyIn }}</span>
        <bdi dir="ltr">{{ v.moneyIn }}</bdi>
      </div>
      <div class="figure">
        <span class="label">{{ t.moneyOut }}</span>
        <bdi dir="ltr">{{ v.moneyOut }}</bdi>
      </div>
    </div>
    <div class="net">
      <span>{{ t.net }}</span>
      <bdi dir="ltr">{{ v.net }}</bdi>
    </div>
    <div class="section">
      @if (v.accounts.length) {
        <div class="grid">
          <span class="head">{{ t.byAccount }}</span>
          <span class="head num">{{ t.in }}</span>
          <span class="head num">{{ t.out }}</span>
          @for (account of v.accounts; track account.name) {
            <span class="account">{{ account.name }}</span>
            <bdi class="num" dir="ltr">{{ account.moneyIn }}</bdi>
            <bdi class="num" dir="ltr">{{ account.moneyOut }}</bdi>
          }
        </div>
      } @else {
        <span class="muted">{{ t.noAccounts }}</span>
      }
    </div>
    @if (v.bars.length) {
      <div class="section" role="img" [attr.aria-label]="t.lastMonths">
        <span class="muted">{{ t.lastMonths }}</span>
        <div class="legend muted">
          <span><span class="swatch in"></span>{{ t.moneyIn }}</span>
          <span><span class="swatch out"></span>{{ t.moneyOut }}</span>
        </div>
        @for (bar of v.bars; track bar.label) {
          <div class="month">
            <span class="muted">{{ bar.label }}</span>
            <div class="bars">
              <div class="bar">
                <span class="in" [style.inline-size.%]="bar.inShare * 75"></span>
                <bdi dir="ltr">{{ bar.moneyIn }}</bdi>
              </div>
              <div class="bar">
                <span class="out" [style.inline-size.%]="bar.outShare * 75"></span>
                <bdi dir="ltr">{{ bar.moneyOut }}</bdi>
              </div>
            </div>
          </div>
        }
      </div>
    }
    <button type="button" (click)="linkSelected.emit()">
      {{ t.link }}
      <svg lucideChevronRight [size]="18" aria-hidden="true"></svg>
    </button>
  `,
})
export class MoneyCardComponent {
  readonly view = input.required<MoneyCardView>();
  readonly text = input.required<MoneyCardText>();
  readonly linkSelected = output<void>();
}
