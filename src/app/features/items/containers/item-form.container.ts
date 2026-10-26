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
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { parseNumber } from '../../../core/format/number';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { toIsoDate } from '../../../core/format/format';
import {
  PrefillNotice,
  PrefillUnavailableError,
  injectPrefillEntry,
  prefillNoticeText,
} from '../../../core/tasks/prefill-entry';
import { PrefillPayloads } from '../../../core/tasks/task-prefill.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { ItemsApiService } from '../data-access/items-api.service';
import { ItemKind, ItemOptions } from '../data-access/items.models';

type Failure = 'permission' | 'offline' | 'duplicate' | 'changed' | 'error';

/** "Add item or service" / "Edit item": what ERPNext needs for an Item, and its selling price and cost. */
@Component({
  selector: 'app-item-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    @let errors = showErrors() ? invalid() : null;
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    <app-page-heading [title]="txt.heading" [subtitle]="txt.subheading" />
    @if (assistantNotice(); as notice) {
      <app-feedback-card [tone]="notice.tone" [title]="notice.title" [message]="notice.message" />
    }
    @if (!allowed()) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (loading()) {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (loadFailed()) {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="loadForm()">{{ txt.retry }}</button>
    } @else {
      @if (!code()) {
        <app-select-field
          [label]="txt.type"
          [options]="txt.types"
          [value]="kind()"
          [disabled]="unresolved()"
          (valueChange)="setKind($event)"
        />
      }
      <app-text-field
        [label]="txt.name"
        [readonly]="unresolved()"
        [error]="errors?.name ? txt.required : null"
        [value]="name()"
        (valueChange)="name.set($event)"
      />
      <app-text-field
        [label]="txt.code"
        [ltr]="true"
        [readonly]="!!code() || unresolved()"
        [hint]="code() ? txt.codeFixed : null"
        [error]="errors?.itemCode ? txt.codeError : null"
        [value]="itemCode()"
        (valueChange)="itemCode.set($event)"
      />
      @if (kind() === 'product') {
        <app-text-field
          [label]="txt.barcode"
          [readonly]="unresolved()"
          [ltr]="true"
          [value]="barcode()"
          (valueChange)="barcode.set($event)"
        />
      }
      <app-select-field
        [label]="txt.group"
        [options]="groupOptions()"
        [disabled]="unresolved()"
        [placeholder]="txt.choose"
        [value]="group() || null"
        (valueChange)="group.set($event ?? '')"
      />
      @if (errors?.group) {
        <p class="muted" role="alert">{{ txt.required }}</p>
      }
      <app-select-field
        [label]="txt.uom"
        [options]="uomOptions()"
        [placeholder]="txt.choose"
        [disabled]="!!code() || unresolved()"
        [value]="uom() || null"
        (valueChange)="uom.set($event ?? '')"
      />
      @if (errors?.uom) {
        <p class="muted" role="alert">{{ txt.required }}</p>
      }
      @if (canSetPrice()) {
        <app-text-field
          [label]="txt.price"
          [readonly]="unresolved()"
          inputmode="decimal"
          [ltr]="true"
          [suffix]="currency()"
          [error]="errors?.price ? txt.priceError : null"
          [value]="price()"
          (valueChange)="price.set($event)"
        />
      }
      @if (kind() === 'product' && seeCosts()) {
        <app-text-field
          [label]="txt.cost"
          [readonly]="unresolved()"
          inputmode="decimal"
          [ltr]="true"
          [suffix]="currency()"
          [hint]="txt.costHint"
          [error]="errors?.cost ? txt.amountError : null"
          [value]="cost()"
          (valueChange)="cost.set($event)"
        />
      }
      @if (kind() === 'service') {
        <app-feedback-card [title]="txt.service.title" [message]="txt.service.message" />
      }
      @if (failed(); as f) {
        <app-feedback-card
          tone="danger"
          [title]="txt.failed[f].title"
          [message]="txt.failed[f].message"
        />
      }
      @if (unresolved()) {
        <app-feedback-card
          tone="warning"
          [title]="txt.unresolved.title"
          [message]="txt.unresolved.message"
        />
        @if (pending()) {
          <p class="muted" role="status">{{ txt.pending }}</p>
        }
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="checking()"
          (click)="check()"
        >
          {{ checking() ? txt.checking : txt.check }}
        </button>
      } @else {
        @if (notCreated()) {
          <app-feedback-card
            tone="warning"
            [title]="txt.notCreated.title"
            [message]="txt.notCreated.message"
          />
        }
        <button type="button" class="md-btn md-btn--primary" [disabled]="saving()" (click)="save()">
          {{ saving() ? txt.saving : txt.save }}
        </button>
      }
      <button type="button" class="md-btn" (click)="back()">{{ txt.cancel }}</button>
    }
  `,
})
export class ItemFormContainer {
  /** Set when editing. */
  readonly code = input<string | undefined>();
  /** "service" to start a new service; a product otherwise. */
  readonly type = input<string | undefined>();
  /** A name to start with: what was searched for where "Add item" was tapped. */
  readonly name$ = input<string | undefined>(undefined, { alias: 'name' });
  /** "purchase" when opened from a new purchase order, which the form returns to. */
  readonly return = input<string | undefined>();

  private readonly api = inject(ItemsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly assistantNotice = computed(() => {
    const notice = this.prefillNotice();
    return notice ? prefillNoticeText(this.i18n.tr(), notice, 'new_item') : null;
  });
  private readonly prefillNotice = signal<PrefillNotice | null>(null);
  /** The assistant's proposal, kept until the form has loaded its lists and can show it. */
  private proposed: PrefillPayloads['new_item'] | null = null;

  protected readonly kind = signal<ItemKind>('product');
  protected readonly name = signal('');
  protected readonly itemCode = signal('');
  protected readonly barcode = signal('');
  protected readonly group = signal('');
  protected readonly uom = signal('');
  protected readonly price = signal('');
  protected readonly cost = signal('');
  private readonly options = signal<ItemOptions | null>(null);
  /** The price and cost as loaded: an edit leaves them alone unless they were changed. */
  private loadedPrice = '';
  private loadedCost = '';
  private loadedModified = '';
  private loadedBarcode = '';
  /** Saving again after a lost add found nothing: a "duplicate" then may be that first add finishing. */
  private afterLostAnswer = false;
  /** An edit whose answer was lost may have saved: its own save then shows as a newer version. */
  private editLost = false;
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failed = signal<Failure | null>(null);
  /** An add whose answer was lost: it may exist, so the user checks before saving again. */
  protected readonly unresolved = signal(false);
  protected readonly checking = signal(false);
  protected readonly pending = signal(false);
  protected readonly notCreated = signal(false);
  private loadRun = 0;

  protected readonly allowed = computed(() => this.session.capabilities().manageItems);
  protected readonly canSetPrice = computed(() => this.session.capabilities().setItemPrices);
  protected readonly seeCosts = computed(() => this.session.capabilities().seeCosts);
  protected readonly currency = computed(() => this.business.active()?.currency ?? '');

  /** Amounts typed (Arabic digits too), or null when left empty. */
  private readonly amounts = computed(() => {
    const read = (text: string) => (text.trim() ? parseNumber(text) : null);
    return { price: read(this.price()), cost: read(this.cost()) };
  });

  protected readonly invalid = computed(() => {
    const { price, cost } = this.amounts();
    const bad = (value: number | null) => value !== null && !(value >= 0);
    // ERPNext doesn't create a price of 0 with a new item: a selling price is above zero.
    const badPrice = (value: number | null) => value !== null && !(value > 0);
    const errors = {
      name: !this.name().trim(),
      // Only a new code: one made in Desk may hold "/", and can't be changed here anyway.
      // "new" is the add page's own address.
      itemCode:
        !this.itemCode().trim() ||
        (!this.code() &&
          (this.itemCode().includes('/') || this.itemCode().trim().toLowerCase() === 'new')),
      group: !this.group(),
      uom: !this.uom(),
      // A price that's set can be changed but not cleared here: ERPNext would keep it.
      price:
        this.canSetPrice() &&
        this.price() !== this.loadedPrice &&
        (badPrice(price) || (!!this.loadedPrice && price === null)),
      cost: this.kind() === 'product' && this.seeCosts() && bad(cost),
    };
    return Object.values(errors).some(Boolean) ? errors : null;
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    const service = this.kind() === 'service';
    const editing = !!this.code();
    return {
      back: t('items.back'),
      heading: editing
        ? t(service ? 'items.form.editService' : 'items.form.editItem')
        : t('items.form.newTitle'),
      subheading: editing ? (this.code() ?? '') : t('items.form.newSubtitle'),
      type: t('items.form.type'),
      types: (['product', 'service'] as const).map((k) => ({
        value: k,
        label: t(`items.form.types.${k}`),
      })),
      name: t(service ? 'items.form.serviceName' : 'items.form.name'),
      code: t(service ? 'items.form.serviceCode' : 'items.form.code'),
      codeFixed: t('items.form.codeFixed'),
      codeError: t('items.form.codeError'),
      barcode: t('items.form.barcode'),
      group: t('items.form.group'),
      uom: t('items.form.uom'),
      price: t('items.form.price'),
      cost: t('items.form.cost'),
      costHint: t('items.form.costHint'),
      choose: t('items.form.choose'),
      required: t('items.form.required'),
      amountError: t('items.form.amountError'),
      priceError: t('items.form.priceError'),
      save: t(service ? 'items.form.saveService' : 'items.form.saveItem'),
      saving: t('items.form.saving'),
      cancel: t('items.form.cancel'),
      loading: t('items.loading'),
      retry: t('items.retry'),
      check: t('sale.checking.check'),
      checking: t('sale.checking.checkingNow'),
      pending: t('sale.checking.pending'),
      service: block('items.serviceCard'),
      noAccess: block('items.form.noAccess'),
      loadFailed: block(editing ? 'items.loadFailed' : 'items.form.optionsFailed'),
      notCreated: block('items.form.notCreated'),
      unresolved: {
        title: t('items.form.unresolved.title'),
        message: t('items.form.unresolved.message', { code: this.itemCode().trim() }),
      },
      failed: {
        permission: block('items.form.failed.permission'),
        offline: block('items.form.failed.offline'),
        duplicate: block('items.form.failed.duplicate'),
        changed: block('items.form.failed.changed'),
        error: block('items.form.failed.error'),
      },
    };
  });

  /** The lists ERPNext offers, keeping a value an edited item has that's since left them. */
  protected readonly groupOptions = computed(() =>
    withCurrent(this.options()?.groups ?? [], this.group()),
  );
  protected readonly uomOptions = computed(() =>
    withCurrent(this.options()?.uoms ?? [], this.uom()),
  );

  constructor() {
    injectPrefillEntry(
      'new_item',
      async (payload) => {
        if (this.code() || !this.allowed()) {
          throw new PrefillUnavailableError('not allowed for your role');
        }
        this.proposed = payload;
        if (this.options()) {
          this.applyProposal();
        }
        return 'opened';
      },
      (notice) => this.prefillNotice.set(notice),
    );
    effect(() => {
      this.code();
      if (this.allowed()) {
        untracked(() => void this.loadForm());
      }
    });
  }

  private applyProposal(): void {
    const proposed = this.proposed;
    if (!proposed) {
      return;
    }
    this.proposed = null;
    this.kind.set(proposed.kind);
    this.name.set(proposed.name);
    if (proposed.price !== undefined && this.canSetPrice()) {
      this.price.set(String(proposed.price));
    }
    this.prefillNotice.set('filled');
  }

  protected setKind(value: string | null): void {
    if (value === 'product' || value === 'service') {
      this.kind.set(value);
    }
  }

  protected async loadForm(): Promise<void> {
    const code = this.code();
    const run = ++this.loadRun;
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const today = toIsoDate(this.clock.now());
      const [options, detail] = await Promise.all([
        this.api.options(),
        code ? this.api.detail(code, business.name, today) : null,
      ]);
      if (run !== this.loadRun) {
        return;
      }
      this.options.set(options);
      if (detail) {
        this.kind.set(detail.kind);
        this.name.set(detail.name);
        this.itemCode.set(detail.code);
        this.barcode.set(detail.barcode);
        this.group.set(detail.group);
        this.uom.set(detail.uom);
        this.loadedPrice = detail.price === null ? '' : String(detail.price);
        this.loadedCost = detail.kind === 'product' ? String(detail.cost) : '';
        this.loadedModified = detail.modified;
        this.loadedBarcode = detail.barcode;
        this.price.set(this.loadedPrice);
        this.cost.set(this.loadedCost);
      } else {
        this.kind.set(this.type() === 'service' ? 'service' : 'product');
        if (!this.name()) {
          this.name.set(this.name$()?.trim() ?? '');
        }
        this.applyProposal();
      }
    } catch {
      if (run === this.loadRun) {
        this.loadFailed.set(true);
      }
    } finally {
      if (run === this.loadRun) {
        this.loading.set(false);
      }
    }
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    // Set before the first await: a double tap must not add the item twice.
    if (
      this.invalid() ||
      this.saving() ||
      this.loading() ||
      this.loadFailed() ||
      this.unresolved()
    ) {
      return;
    }
    this.saving.set(true);
    this.failed.set(null);
    this.notCreated.set(false);
    const editing = this.code();
    const { price, cost } = this.amounts();
    let found: { name: string; itemName: string } | null = null;
    const costSent = this.cost();
    const value = {
      kind: this.kind(),
      name: this.name(),
      code: this.itemCode().trim(),
      barcode: this.kind() === 'product' ? this.barcode() : '',
      group: this.group(),
      uom: this.uom(),
      price: this.canSetPrice() && (!editing || this.price() !== this.loadedPrice) ? price : null,
      cost:
        this.kind() === 'product' &&
        this.seeCosts() &&
        (!editing || this.cost() !== this.loadedCost)
          ? cost
          : null,
    };
    try {
      await this.clock.ensure();
      const today = toIsoDate(this.clock.now());
      if (editing) {
        await this.api.update(
          editing,
          value,
          this.canSetPrice(),
          this.loadedModified,
          today,
          (modified) => {
            this.loadedModified = modified;
            // Saved with the item: a retry only sends the price (and a cost typed since).
            this.loadedCost = costSent;
          },
          this.loadedBarcode,
        );
        void this.router.navigate(['/catalog', editing], { replaceUrl: true });
      } else {
        const created = await this.api.create(value);
        this.done(created);
      }
    } catch (error) {
      if (
        editing &&
        this.editLost &&
        ErpnextError.from(error).excType === 'TimestampMismatchError'
      ) {
        // The newer version may be that lost save: build on it, once, only if it holds what was sent.
        this.editLost = false;
        const saved = await this.api.savedAs(editing, value).catch(() => null);
        if (saved) {
          this.loadedModified = saved;
          this.saving.set(false);
          await this.save();
          return;
        }
      }
      if (editing && error instanceof UnresolvedError) {
        this.editLost = true;
      }
      if (error instanceof UnresolvedError && !editing) {
        // ERPNext may still be adding it: look the code up before saving again, so it isn't added twice.
        this.unresolved.set(true);
      } else if (
        !editing &&
        this.afterLostAnswer &&
        ErpnextError.from(error).excType === 'DuplicateEntryError' &&
        (found = await this.api.exists(value.code).catch(() => null))?.itemName ===
          value.name.trim()
      ) {
        // An earlier add whose answer was lost finished after all: that item is this one.
        this.done(found!.name);
      } else {
        const e = ErpnextError.from(error);
        if (e.kind === 'forbidden') {
          void this.session.checkExpired();
        }
        this.failed.set(
          e.kind === 'forbidden'
            ? 'permission'
            : error instanceof UnresolvedError || e.kind === 'offline'
              ? 'offline'
              : e.excType === 'DuplicateEntryError'
                ? 'duplicate'
                : e.excType === 'TimestampMismatchError'
                  ? 'changed'
                  : 'error',
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async check(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    this.pending.set(false);
    const code = this.itemCode().trim();
    try {
      const found = await this.api.exists(code);
      this.unresolved.set(false);
      if (found !== null && found.itemName === this.name().trim()) {
        this.done(found.name);
        return;
      }
      if (found !== null) {
        // Another item holds the code: this add didn't make it.
        this.failed.set('duplicate');
        return;
      }
      this.notCreated.set(true);
      this.afterLostAnswer = true;
    } catch {
      this.pending.set(true);
    } finally {
      this.checking.set(false);
    }
  }

  /** A new item made: its page, or the purchase order it was added for, with it on the order. */
  private done(created: string): void {
    void this.router.navigate(this.fromPurchase() ? ['/purchases/new'] : ['/catalog', created], {
      replaceUrl: true,
      queryParams: this.fromPurchase() ? { from: 'catalog', added: created } : {},
    });
  }

  private fromPurchase(): boolean {
    return !this.code() && this.return() === 'purchase';
  }

  protected back(): void {
    const code = this.code();
    if (this.fromPurchase()) {
      // Back to the order as it was left.
      void this.router.navigate(['/purchases/new'], { queryParams: { from: 'catalog' } });
      return;
    }
    void this.router.navigate(code ? ['/catalog', code] : ['/catalog']);
  }
}

function withCurrent(values: readonly string[], current: string) {
  return [...(current && !values.includes(current) ? [current] : []), ...values].map((v) => ({
    value: v,
    label: v,
  }));
}
