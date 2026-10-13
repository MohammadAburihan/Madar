import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CustomerOption } from '../../../core/customers/customer-directory.service';
import { formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { UnpaidInvoice } from '../data-access/collection.models';
import { injectCollectionContext } from './collection-context';
import { customerCard, dueRows, invoiceCard } from './collection-view';

const SEARCH_DELAY_MS = 250;

/** Step 1 of "Receive payment": customer, the invoices to pay, the amount, and the account. */
@Component({
  selector: 'app-collect-choose',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PersonCardComponent,
    SearchFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.step" />
    @if (!ctx.session.capabilities().collect) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
      @if (term().trim()) {
        @for (customer of results(); track customer.id) {
          @let card = customerCardFor(customer);
          <app-person-card
            [title]="card.title"
            [meta]="card.meta"
            [balance]="card.balance"
            [selected]="ctx.store.customer()?.id === customer.id"
            (picked)="pick(customer)"
          />
        } @empty {
          @if (!searching()) {
            <p class="muted">{{ txt.noResults }}</p>
          }
        }
      } @else if (ctx.store.customer(); as chosen) {
        @let card = customerCardFor(chosen);
        <app-person-card [title]="card.title" [meta]="card.meta" [balance]="card.balance" />
      }

      @if (ctx.store.customer() && !term().trim()) {
        @if (ctx.store.loadingInvoices()) {
          <p class="muted" role="status">{{ txt.loadingInvoices }}</p>
        } @else if (ctx.store.invoicesFailed()) {
          <app-feedback-card
            tone="danger"
            [title]="txt.loadFailed.title"
            [message]="txt.loadFailed.message"
          />
          <button type="button" class="md-btn" (click)="retry()">{{ txt.retry }}</button>
        } @else if (!ctx.store.invoices().length) {
          <app-feedback-card [title]="txt.noInvoices.title" [message]="txt.noInvoices.message" />
        } @else {
          @for (invoice of ctx.store.invoices(); track invoice.name) {
            @let card = invoiceCardFor(invoice);
            <app-person-card
              [title]="card.title"
              [balance]="card.detail"
              [selected]="ctx.store.selected().has(invoice.name)"
              (picked)="ctx.store.toggle(invoice.name)"
            />
          }
          <app-text-field
            variant="amount"
            [label]="txt.amount"
            [suffix]="ctx.currency()"
            inputmode="decimal"
            [ltr]="true"
            [(value)]="ctx.store.amountInput"
            [error]="amountError()"
          />
          <app-totals-card density="compact" [rows]="rows()" />
          @if (accountOptions().length) {
            <app-select-field
              [label]="txt.account"
              [options]="accountOptions()"
              [value]="ctx.store.account()?.mode ?? null"
              (valueChange)="setAccount($event)"
            />
          } @else if (accountsLoaded()) {
            <app-feedback-card
              tone="warning"
              [title]="txt.noAccount.title"
              [message]="txt.noAccount.message"
            />
          }
          <button
            type="button"
            class="md-btn md-btn--primary"
            [disabled]="!ctx.store.ready()"
            (click)="ctx.go('review')"
          >
            {{ txt.review }}
          </button>
        }
      }
    }
  `,
})
export class CollectChooseContainer implements OnInit {
  /** Optional deep link from an invoice or Home: preselect this customer (and invoice). */
  readonly customer = input<string | undefined>();
  readonly invoice = input<string | undefined>();

  protected readonly ctx = injectCollectionContext();
  protected readonly term = signal('');
  protected readonly results = signal<CustomerOption[]>([]);
  protected readonly searching = signal(false);
  protected readonly accountsLoaded = signal(false);
  private searchRun = 0;

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('collect.title'),
      step: t('collect.step'),
      search: t('collect.search'),
      placeholder: t('collect.placeholder'),
      noResults: t('collect.noResults'),
      loadingInvoices: t('collect.loadingInvoices'),
      noInvoices: {
        title: t('collect.noInvoices.title'),
        message: t('collect.noInvoices.message'),
      },
      loadFailed: {
        title: t('collect.loadFailed.title'),
        message: t('collect.loadFailed.message'),
      },
      retry: t('collect.retry'),
      amount: t('collect.amount'),
      account: t('collect.account'),
      noAccount: { title: t('collect.noAccount.title'), message: t('collect.noAccount.message') },
      review: t('collect.review'),
      noAccess: { title: t('collect.noAccess.title'), message: t('collect.noAccess.message') },
    };
  });

  protected readonly rows = computed(() =>
    dueRows(
      this.ctx.store.due(),
      this.ctx.store.amount(),
      this.ctx.store.selected().size,
      this.ctx.currency(),
      this.ctx.i18n.tr(),
    ),
  );

  protected readonly amountError = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const store = this.ctx.store;
    if (!store.selected().size) {
      return t('collect.chooseInvoice');
    }
    if (!store.amountInput().trim() || store.amountValid()) {
      return null;
    }
    return store.amount() > store.due()
      ? t('collect.tooMuch', { amount: formatMoney(store.due(), this.ctx.currency()) })
      : t('collect.invalidAmount');
  });

  protected readonly accountOptions = computed(() =>
    this.ctx.store.accounts().map((a) => ({ value: a.mode, label: a.label })),
  );

  constructor() {
    effect((onCleanup) => {
      const term = this.term();
      if (!term.trim()) {
        return;
      }
      const timer = setTimeout(() => untracked(() => this.search(term)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.busy()) {
      void this.ctx.go('checking', { replaceUrl: true });
      return;
    }
    // Coming back from review (Edit, Back, or the browser/Android back button) keeps the collection and any
    // draft to edit; any other visit starts fresh.
    const navigation = this.ctx.router.getCurrentNavigation();
    const editing =
      navigation?.extras.state?.['edit'] === true || navigation?.trigger === 'popstate';
    if (!editing) {
      store.resume();
    }
    void this.ctx.clock.ensure();
    void store
      .loadAccounts()
      .catch(() => undefined)
      .finally(() => this.accountsLoaded.set(true));
    const deepLink = this.customer();
    if (deepLink && store.customer()?.id !== deepLink) {
      void this.openDeepLink(deepLink, this.invoice());
    }
  }

  protected customerCardFor(customer: CustomerOption) {
    return customerCard(customer, this.ctx.currency(), this.ctx.i18n.tr());
  }

  protected invoiceCardFor(invoice: UnpaidInvoice) {
    return invoiceCard(
      invoice,
      this.ctx.currency(),
      this.ctx.clock.now(),
      this.ctx.i18n.language(),
      this.ctx.i18n.tr(),
    );
  }

  protected pick(customer: CustomerOption): void {
    this.term.set('');
    this.results.set([]);
    void this.ctx.store.selectCustomer(customer);
  }

  protected retry(): void {
    const customer = this.ctx.store.customer();
    if (customer) {
      void this.ctx.store.selectCustomer(customer);
    }
  }

  protected setAccount(mode: string | null): void {
    this.ctx.store.account.set(this.ctx.store.accounts().find((a) => a.mode === mode) ?? null);
  }

  private async openDeepLink(customerId: string, invoice: string | undefined): Promise<void> {
    const [match] = (await this.ctx.store.searchCustomers(customerId).catch(() => [])).filter(
      (c) => c.id === customerId,
    );
    if (match) {
      await this.ctx.store.selectCustomer(match, invoice);
    }
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
