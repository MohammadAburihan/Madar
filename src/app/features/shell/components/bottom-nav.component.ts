import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { NavItem } from './nav-item';

@Component({
  selector: 'app-bottom-nav',
  imports: [LucideDynamicIcon, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="navLabel()">
      @for (item of items(); track item.id) {
        <a
          class="item"
          [routerLink]="item.route"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: item.route === '/' }"
          ariaCurrentWhenActive="page"
        >
          <svg [lucideIcon]="item.icon" [size]="20" aria-hidden="true"></svg>
          <span>{{ item.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
      padding: 0 20px calc(16px + env(safe-area-inset-bottom));
    }

    nav {
      display: flex;
      gap: 4px;
      block-size: 72px;
      padding: 8px;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
    }

    .item {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      border-radius: 8px;
      color: var(--md-muted);
      font: 400 12px / var(--md-lh) var(--md-font);
      text-decoration: none;

      &.active {
        background: var(--md-tint);
        color: var(--md-primary);
        font-weight: 700;
      }
    }
  `,
})
export class BottomNavComponent {
  readonly items = input.required<readonly NavItem[]>();
  readonly navLabel = input.required<string>();
}
