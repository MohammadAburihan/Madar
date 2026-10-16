import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import {
  CustomerDirectoryService,
  CustomerOption,
} from '../../../core/customers/customer-directory.service';
import { formatMoney } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { NATIVE_PLATFORM } from '../../../core/platform/native-platform';
import {
  SupplierDirectoryService,
  SupplierOption,
} from '../../../core/suppliers/supplier-directory.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { MetricCardsComponent } from '../components/metric-cards.component';
import { StatementEntriesComponent } from '../components/statement-entries.component';
import { PartyKind, Statement } from '../data-access/report.models';
import { StatementsApiService } from '../data-access/statements-api.service';
import { createPeriod } from './period';
import {
  entryCards,
  entryRoute,
  entryRows,
  statementHtml,
  statementMetrics,
  statementSubtitle,
  summaryRows,
} from './statement-view';

const SEARCH_DELAY_MS = 250;

interface Party {
  id: string;
  name: string;
  meta: string | null;
}

/** A customer's or supplier's statement for a period, to read on screen or share as a PDF (owner only). */
@Component({
  selector: 'app-statement',
  imports: [
    BackLinkComponent,
    DataTableComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    LanguageSwitcherComponent,
    MetricCardsComponent,
    PageHeadingComponent,
    PersonCardComponent,
    SearchFieldComponent,
    SelectFieldComponent,
    StatementEntriesComponent,
    TextFieldComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'desktop()', '[class.tablet]': "viewport() === 'tablet'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 17px / var(--md-lh) var(--md-font);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 24px;
    }

    .filters > .party {
      inline-size: 280px;
    }

    .dates {
      display: flex;
      gap: 12px;
    }

    .actions {
      display: flex;
      gap: 12px;
      white-space: nowrap;
    }
  `,
  template: `
    @let txt = text();
    <app-back-link [label]="txt.back" (back)="router.navigate(['/reports'])" />
    @if (desktop()) {
      <app-page-heading layout="desktop" [title]="txt.title" [subtitle]="subtitle()">
        @if (statement() && canExport) {
          <div class="actions">
            <button type="button" class="md-btn" [disabled]="preparing()" (click)="share()">
              {{ txt.share }}
            </button>
            <button
              type="button"
              class="md-btn md-btn--primary"
              [disabled]="preparing()"
              (click)="download()"
            >
              {{ preparing() ? txt.preparing : txt.download }}
            </button>
          </div>
        }
      </app-page-heading>
    }
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    @if (!desktop()) {
      <app-page-heading [title]="txt.title" [subtitle]="subtitle()" />
    }
    @if (!caps().seeReports) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      <div [class.filters]="desktop()" [class.stack]="!desktop()">
        <div class="party stack">
          @if (kind() === 'supplier') {
            <app-select-field
              [label]="txt.party"
              [options]="supplierOptions()"
              [placeholder]="txt.chooseSupplier"
              [value]="party()?.id ?? null"
              (valueChange)="chooseSupplier($event)"
            />
          } @else if (party(); as p) {
            <app-person-card
              [title]="p.name"
              [meta]="p.meta"
              [balance]="txt.changeLabel"
              (picked)="clearParty()"
            />
          } @else {
            <app-search-field
              [label]="txt.party"
              [placeholder]="txt.searchCustomer"
              [(value)]="term"
            />
            @for (customer of customers(); track customer.id) {
              <app-person-card
                [title]="customer.name"
                [meta]="customerMeta(customer)"
                (picked)="chooseCustomer(customer)"
              />
            } @empty {
              @if (term().trim()) {
                <p class="muted">{{ txt.noCustomers }}</p>
              }
            }
          }
        </div>
        @if (desktop()) {
          <app-filter-chips
            [label]="txt.period"
            [options]="period.kinds()"
            [value]="period.kind()"
            (valueChange)="period.setKind($event)"
          />
          <div class="dates">
            <app-text-field
              [label]="txt.from"
              type="date"
              [value]="period.range().from"
              (valueChange)="period.setCustom('from', $event)"
            />
            <app-text-field
              [label]="txt.to"
              type="date"
              [value]="period.range().to"
              [error]="period.error()"
              (valueChange)="period.setCustom('to', $event)"
            />
          </div>
        } @else {
          <app-select-field
            [label]="txt.period"
            [options]="period.options()"
            [value]="period.kind()"
            (valueChange)="period.setKind($event)"
          />
          @if (period.kind() === 'custom') {
            <div class="dates">
              <app-text-field
                [label]="txt.from"
                type="date"
                [value]="period.range().from"
                (valueChange)="period.setCustom('from', $event)"
              />
              <app-text-field
                [label]="txt.to"
                type="date"
                [value]="period.range().to"
                [error]="period.error()"
                (valueChange)="period.setCustom('to', $event)"
              />
            </div>
          }
        }
      </div>
      @if (partyMissing()) {
        <app-feedback-card
          tone="warning"
          [title]="txt.partyMissing.title"
          [message]="txt.partyMissing.message"
        />
      }
      @if (state() === 'error') {
        <app-feedback-card
          tone="danger"
          [title]="txt.loadFailed.title"
          [message]="txt.loadFailed.message"
        />
        <button type="button" class="md-btn" (click)="retry()">{{ txt.retry }}</button>
      } @else if (view(); as v) {
        @if (desktop()) {
          <app-metric-cards [metrics]="v.metrics" />
          <h2>{{ txt.entriesDesktop }}</h2>
          <app-data-table
            [label]="txt.entriesDesktop"
            [headers]="txt.headers"
            [rows]="v.rows"
            [ltrColumns]="[0, 3, 4, 5]"
            [interactive]="true"
            (opened)="open($event)"
          />
        } @else {
          <app-totals-card density="compact" [rows]="v.summary" />
          <h2>{{ txt.entries }}</h2>
          @if (v.cards.length) {
            <app-statement-entries [entries]="v.cards" (opened)="open($event)" />
          } @else {
            <p class="muted">{{ txt.noEntries }}</p>
          }
        }
        @if (pdfFailed()) {
          <app-feedback-card
            tone="danger"
            [title]="txt.pdfFailed.title"
            [message]="txt.pdfFailed.message"
          />
        }
        @if (!canExport) {
          <p class="muted">{{ txt.exportOnWeb }}</p>
        } @else if (!desktop()) {
          <button
            type="button"
            class="md-btn md-btn--primary"
            [disabled]="preparing()"
            (click)="share()"
          >
            {{ preparing() ? txt.preparing : txt.shareMobile }}
          </button>
          <button type="button" class="md-btn" [disabled]="preparing()" (click)="download()">
            {{ txt.download }}
          </button>
        }
        <p class="muted">{{ txt.note }}</p>
      } @else if (party() && state() === 'loading' && period.usable()) {
        <p class="muted" role="status">{{ txt.loading }}</p>
      }
    }
  `,
})
export class StatementContainer {
  /** From the route: whose statement this page shows. */
  readonly kind = input<PartyKind>('customer');
  /** A customer or supplier id from the link, to open on. */
  readonly party$ = input<string | undefined>(undefined, { alias: 'party' });

  private readonly api = inject(StatementsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly customersApi = inject(CustomerDirectoryService);
  private readonly suppliersApi = inject(SupplierDirectoryService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  /** The phone apps can't save or share files until the native share and file plugins are added. */
  protected readonly canExport = inject(NATIVE_PLATFORM) === 'web';
  private readonly today = signal<Date | null>(null);
  protected readonly period = createPeriod(this.today, this.i18n.tr, this.i18n.language);
  protected readonly party = signal<Party | null>(null);
  protected readonly partyMissing = signal(false);
  protected readonly term = signal('');
  protected readonly customers = signal<CustomerOption[]>([]);
  private readonly suppliers = signal<SupplierOption[]>([]);
  protected readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly statement = signal<Statement | null>(null);
  protected readonly preparing = signal(false);
  protected readonly pdfFailed = signal(false);
  private run = 0;
  private searchRun = 0;

  protected readonly supplierOptions = computed(() =>
    this.suppliers().map((s) => ({ value: s.id, label: s.name })),
  );

  protected readonly subtitle = computed(() =>
    statementSubtitle(
      this.business.active()?.name ?? '',
      this.party()?.name ?? null,
      { range: this.period.range() },
      this.i18n.language(),
    ),
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const customer = this.kind() === 'customer';
    const currency = this.business.active()?.currency ?? '';
    const statement = this.statement();
    return {
      back: t('reports.title'),
      title: t(customer ? 'statements.customerTitle' : 'statements.supplierTitle'),
      party: t(customer ? 'statements.customer' : 'statements.supplier'),
      searchCustomer: t('statements.searchCustomer'),
      noCustomers: t('statements.noCustomers'),
      chooseSupplier: t('statements.chooseSupplier'),
      changeLabel: statement
        ? t('statements.partyOutstanding', {
            amount: formatMoney(statement.outstanding, currency),
          })
        : t('statements.change'),
      period: t('reports.period.label'),
      from: t('reports.period.from'),
      to: t('reports.period.to'),
      entries: t('statements.entries'),
      entriesDesktop: t('statements.entriesDesktop', { currency }),
      noEntries: t('statements.noEntries'),
      headers: ['date', 'document', 'details', 'invoiced', 'paid', 'balance'].map((key) =>
        t(`statements.headers.${key}`),
      ),
      share: t('statements.share'),
      shareMobile: t('statements.shareMobile'),
      download: t('statements.download'),
      preparing: t('statements.preparing'),
      exportOnWeb: t('statements.exportOnWeb'),
      note: t('statements.note'),
      loading: t('statements.loading'),
      retry: t('reports.retry'),
      noAccess: { title: t('reports.noAccess.title'), message: t('reports.noAccess.message') },
      loadFailed: {
        title: t('statements.loadFailed.title'),
        message: t('statements.loadFailed.message'),
      },
      pdfFailed: {
        title: t('statements.pdfFailed.title'),
        message: t('statements.pdfFailed.message'),
      },
      partyMissing: {
        title: t('statements.partyMissing.title'),
        message: t('statements.partyMissing.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const statement = this.statement();
    // A statement for other dates or another party than the ones chosen is not shown as theirs.
    if (
      !statement ||
      this.state() !== 'ready' ||
      !this.period.usable() ||
      statement.party !== this.party()?.id
    ) {
      return null;
    }
    const tr = this.i18n.tr();
    const currency = this.business.active()?.currency ?? '';
    return {
      summary: summaryRows(statement, currency, tr),
      metrics: statementMetrics(statement, currency, tr),
      cards: entryCards(statement, currency, tr),
      rows: entryRows(statement, tr),
    };
  });

  constructor() {
    void this.clock
      .ensure()
      .then(() => this.today.set(this.clock.now()))
      .catch(() => this.state.set('error'));
    effect(() => {
      if (this.kind() === 'supplier' && this.caps().seeReports) {
        untracked(() => void this.loadSuppliers().catch(() => this.state.set('error')));
      }
    });
    effect(() => {
      const id = this.party$();
      if (id && this.caps().seeReports) {
        untracked(() => void this.openParty(id));
      }
    });
    effect((onCleanup) => {
      const term = this.term();
      if (this.kind() !== 'customer' || this.party()) {
        return;
      }
      const timer = setTimeout(() => untracked(() => void this.search(term)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
    effect(() => {
      const party = this.party();
      const range = this.period.range();
      if (this.today() && party && this.period.usable() && this.caps().seeReports) {
        untracked(() => void this.loadStatement(party.id, range));
      }
    });
  }

  protected customerMeta(customer: CustomerOption): string | null {
    return [customer.phone, customer.city].filter(Boolean).join(' · ') || null;
  }

  protected chooseCustomer(customer: CustomerOption): void {
    this.partyMissing.set(false);
    this.party.set({ id: customer.id, name: customer.name, meta: this.customerMeta(customer) });
  }

  protected chooseSupplier(id: string | null): void {
    this.partyMissing.set(false);
    const supplier = this.suppliers().find((s) => s.id === id);
    this.party.set(supplier ? { id: supplier.id, name: supplier.name, meta: supplier.city } : null);
  }

  protected clearParty(): void {
    // A load still running belongs to the party being cleared.
    this.run++;
    this.party.set(null);
    this.statement.set(null);
    this.state.set('idle');
  }

  /** Redoes every step that failed, in order: the site's today, the supplier list, the linked party, the statement. */
  protected async retry(): Promise<void> {
    this.state.set('idle');
    try {
      if (!this.today()) {
        await this.clock.ensure();
        this.today.set(this.clock.now());
      }
      if (this.kind() === 'supplier') {
        await this.loadSuppliers();
      }
      const linked = this.party$();
      if (linked && !this.party()) {
        await this.openParty(linked);
      }
    } catch {
      this.state.set('error');
      return;
    }
    const party = this.party();
    if (party && this.period.usable()) {
      void this.loadStatement(party.id, this.period.range());
    }
  }

  protected open(id: string): void {
    const statement = this.statement();
    const entry = statement?.entries.find((e) => e.voucher === id);
    const route = statement && entry ? entryRoute(statement.kind, entry) : null;
    if (route) {
      void this.router.navigate(route);
    }
  }

  protected async download(): Promise<void> {
    const file = await this.pdfFile();
    if (file) {
      saveFile(file);
    }
  }

  protected async share(): Promise<void> {
    const file = await this.pdfFile();
    if (!file) {
      return;
    }
    // The device's share sheet where the browser offers one for files; a download otherwise.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
      } catch (error) {
        // The tap's permission may have lapsed while the PDF rendered; download instead. Cancelling is silent.
        if ((error as Error)?.name !== 'AbortError') {
          saveFile(file);
        }
      }
    } else {
      saveFile(file);
    }
  }

  private async pdfFile(): Promise<File | null> {
    const statement = this.view() ? this.statement() : null;
    if (!statement || this.preparing()) {
      return null;
    }
    this.preparing.set(true);
    this.pdfFailed.set(false);
    try {
      const tr = this.i18n.tr();
      const html = statementHtml(
        statement,
        this.text().title,
        this.subtitle(),
        this.business.active()?.currency ?? '',
        this.i18n.language(),
        tr,
      );
      const blob = await this.api.pdf(html);
      const name = tr
        .t('statements.fileName', {
          party: this.party()?.name ?? statement.party,
          from: statement.range.from,
          to: statement.range.to,
        })
        .replace(/[⁨⁩]/g, '')
        .replace(/[\\/:*?"<>|]/g, '-');
      return new File([blob], `${name}.pdf`, { type: 'application/pdf' });
    } catch {
      this.pdfFailed.set(true);
      return null;
    } finally {
      this.preparing.set(false);
    }
  }

  private async loadStatement(id: string, range: { from: string; to: string }): Promise<void> {
    const run = ++this.run;
    this.state.set('loading');
    this.pdfFailed.set(false);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No business');
      }
      const statement = await this.api.statement(this.kind(), id, business.name, range);
      if (run === this.run) {
        this.statement.set(statement);
        this.state.set('ready');
      }
    } catch {
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }

  private async openParty(id: string): Promise<void> {
    try {
      if (this.kind() === 'supplier') {
        await this.loadSuppliers();
        this.chooseSupplier(id);
        this.partyMissing.set(!this.party());
        return;
      }
      const customer = await this.customersApi.byId(id);
      if (customer) {
        this.chooseCustomer(customer);
      } else {
        this.partyMissing.set(true);
      }
    } catch {
      this.state.set('error');
    }
  }

  private async loadSuppliers(): Promise<void> {
    if (!this.suppliers().length) {
      this.suppliers.set(await this.suppliersApi.list());
    }
  }

  private async search(term: string): Promise<void> {
    const run = ++this.searchRun;
    try {
      const found = await this.customersApi.search(term);
      if (run === this.searchRun) {
        this.customers.set(found);
      }
    } catch {
      if (run === this.searchRun) {
        this.customers.set([]);
      }
    }
  }
}

function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
