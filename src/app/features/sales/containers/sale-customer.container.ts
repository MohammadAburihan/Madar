import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { BusinessService } from '../../../core/business/business.service';
import { CustomerDirectoryService } from '../../../core/customers/customer-directory.service';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { CustomerOption } from '../data-access/sale.models';
import { customerView, stepSubtitle } from './quick-sale-view';
import { injectSaleContext } from './sale-context';

const SEARCH_DELAY_MS = 250;

@Component({
  selector: 'app-sale-customer',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PersonCardComponent,
    SearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="text().back" (back)="ctx.router.navigate(['/'])" />
    <app-page-heading
      [title]="text().title"
      [subtitle]="text().subtitle"
      [layout]="ctx.desktop() ? 'desktop' : 'mobile'"
    />
    @if (ctx.prefillNotice(); as proposal) {
      <app-feedback-card
        [tone]="proposal.tone"
        [title]="proposal.title"
        [message]="proposal.message"
      />
    }
    @if (!ctx.session.capabilities().sell) {
      <app-feedback-card
        tone="warning"
        [title]="text().noAccess.title"
        [message]="text().noAccess.message"
      />
    } @else {
      @if (linkedMissing()) {
        <app-feedback-card
          tone="warning"
          [title]="text().linkedMissing.title"
          [message]="text().linkedMissing.message"
        />
      }
      <app-search-field
        [label]="text().search"
        [placeholder]="text().placeholder"
        [(value)]="term"
      />
      @for (customer of results(); track customer.id) {
        @let card = cardFor(customer);
        <app-person-card
          [title]="card.title"
          [meta]="card.meta"
          [balance]="card.balance"
          [selected]="ctx.store.customer()?.id === customer.id"
          (picked)="ctx.store.selectCustomer(customer)"
        />
      } @empty {
        @if (term().trim() && !searching()) {
          <p class="muted">{{ text().noResults }}</p>
        }
      }
      @if (ctx.store.customer(); as chosen) {
        <button type="button" class="md-btn md-btn--primary" (click)="ctx.go('items')">
          {{ continueLabel() }}
        </button>
      }
      @if (ctx.session.capabilities().sellToWalkIn) {
        <button type="button" class="md-btn" (click)="ctx.store.useWalkIn(); ctx.go('items')">
          {{ text().walkIn }}
        </button>
      }
      <button
        type="button"
        class="md-btn"
        (click)="ctx.go('customer/new', { queryParams: { return: 'items' } })"
      >
        {{ text().add }}
      </button>
      <p class="muted">{{ text().note }}</p>
    }
  `,
})
export class SaleCustomerContainer implements OnInit {
  protected readonly ctx = injectSaleContext();
  /** Optional deep link from a customer's page: the sale starts with them chosen. */
  readonly customer = input<string | undefined>();

  private readonly directory = inject(CustomerDirectoryService);
  private readonly business = inject(BusinessService);
  protected readonly linkedMissing = signal(false);
  protected readonly term = signal('');
  protected readonly results = signal<CustomerOption[]>([]);
  protected readonly searching = signal(false);
  private searchRun = 0;

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('sale.customer.title'),
      subtitle: stepSubtitle(1, t('sale.customer.stepLabel'), this.ctx.i18n.tr()),
      search: t('sale.customer.search'),
      placeholder: t('sale.customer.placeholder'),
      walkIn: t('sale.customer.walkIn'),
      add: t('sale.customer.add'),
      note: t('sale.customer.note'),
      noResults: t('sale.customer.noResults', { term: this.term().trim() }),
      linkedMissing: {
        title: t('sale.customer.linkedMissing.title'),
        message: t('sale.customer.linkedMissing.message'),
      },
      noAccess: { title: t('sale.noAccess.title'), message: t('sale.noAccess.message') },
    };
  });

  protected readonly continueLabel = computed(() => {
    const name = this.ctx.store.customer()?.name ?? '';
    // The design addresses the customer by first name: "Continue with Lina".
    return this.ctx.i18n.tr().t('sale.customer.continueWith', { name: name.split(/\s+/)[0] });
  });

  constructor() {
    effect((onCleanup) => {
      const term = this.term();
      const timer = setTimeout(() => untracked(() => this.search(term)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit(): void {
    const state = this.ctx.store.state();
    if (state === 'confirmed') {
      this.ctx.store.start();
    } else if (state === 'unresolved' || state === 'checking') {
      void this.ctx.go('checking', { replaceUrl: true });
      return;
    }
    void this.ctx.store.loadOptions().catch(() => undefined);
    const id = this.customer();
    const before = this.ctx.store.customer()?.id;
    this.linkedMissing.set(false);
    if (id && before !== id) {
      void this.business
        .ensure()
        .then((business) => (business ? this.directory.byId(id, business) : undefined))
        // The linked customer replaces one left from an earlier visit, not one picked while it loaded.
        .then((found) => {
          // No business loaded isn't the customer's fault, and a choice made meanwhile stands.
          if (found === undefined || this.ctx.store.customer()?.id !== before) {
            return;
          }
          if (found) {
            this.ctx.store.selectCustomer(found);
          } else {
            // Deleted or disabled since their page was opened: say so rather than start without them.
            this.linkedMissing.set(true);
          }
        })
        .catch(() => undefined);
    }
  }

  protected cardFor(customer: CustomerOption) {
    return customerView(customer, this.ctx.currency(), this.ctx.i18n.tr());
  }

  private async search(term: string): Promise<void> {
    const run = ++this.searchRun;
    this.searching.set(true);
    try {
      const results = await this.ctx.store.searchCustomers(term);
      if (run === this.searchRun) {
        this.results.set(results);
      }
    } catch {
      if (run === this.searchRun) {
        this.results.set([]);
      }
    } finally {
      if (run === this.searchRun) {
        this.searching.set(false);
      }
    }
  }
}
