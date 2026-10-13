import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { NavItem } from './nav-item';

@Component({
  selector: 'app-sidebar-nav',
  imports: [LucideDynamicIcon, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.rail]': "variant() === 'rail'" },
  template: `
    <div class="top">
      <p class="wordmark">{{ variant() === 'rail' ? wordmarkShort() : wordmark() }}</p>
      @if (variant() === 'full') {
        <div class="business">
          <span class="label" id="active-business-label">{{ businessLabel() }}</span>
          <button
            type="button"
            class="control"
            aria-labelledby="active-business-label"
            [attr.aria-description]="businessName()"
            (click)="switchBusiness.emit()"
          >
            <bdi>{{ businessName() }}</bdi> ▾
          </button>
        </div>
      }
      <nav [attr.aria-label]="navLabel()">
        @for (item of items(); track item.id) {
          <a
            class="item"
            [routerLink]="item.route"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: item.route === '/' }"
            ariaCurrentWhenActive="page"
            [attr.aria-label]="variant() === 'rail' ? item.label : null"
            [attr.title]="variant() === 'rail' ? item.label : null"
          >
            <svg [lucideIcon]="item.icon" [size]="20" aria-hidden="true"></svg>
            @if (variant() === 'full') {
              <span>{{ item.label }}</span>
            }
          </a>
        }
      </nav>
    </div>
    <p class="user">
      @if (variant() === 'full') {
        {{ userName() }}<br />{{ userMeta() }}
      } @else {
        <span [attr.aria-label]="userName()">{{ initials() }}</span>
      }
    </p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
      inline-size: 232px;
      block-size: 100%;
      padding: 20px;
      border-inline-end: 1px solid var(--md-line);
      background: var(--md-surface);
      overflow-y: auto;
    }

    .top {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    .wordmark {
      color: var(--md-primary);
      font: 700 24px / var(--md-lh) var(--md-font);
    }

    .business {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .label {
      color: var(--md-muted);
      font: 600 14px / var(--md-lh) var(--md-font);
    }

    .control {
      display: flex;
      align-items: center;
      gap: 4px;
      min-block-size: 48px;
      padding: 0 12px;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
      text-align: start;
      cursor: pointer;
    }

    nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .item {
      display: flex;
      align-items: center;
      gap: 12px;
      min-block-size: 48px;
      padding: 12px;
      border-radius: 8px;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      text-decoration: none;

      svg {
        flex: none;
        color: var(--md-primary);
      }

      &:hover {
        background: var(--md-bg);
      }

      &.active {
        background: var(--md-tint);
        font-weight: 700;
      }
    }

    .user {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    :host(.rail) {
      inline-size: 80px;
      padding: 20px 8px;

      .wordmark {
        font-size: 28px;
      }

      .item {
        justify-content: center;
      }
    }
  `,
})
export class SidebarNavComponent {
  readonly variant = input<'full' | 'rail'>('full');
  readonly items = input.required<readonly NavItem[]>();
  readonly navLabel = input.required<string>();
  readonly wordmark = input.required<string>();
  readonly wordmarkShort = input.required<string>();
  readonly businessLabel = input.required<string>();
  readonly businessName = input.required<string>();
  readonly userName = input.required<string>();
  readonly userMeta = input.required<string>();
  readonly initials = input.required<string>();
  readonly switchBusiness = output<void>();
}
