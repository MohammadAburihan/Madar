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
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { PagedList } from '../../../core/util/paged-list';
import { TaskPrefillService } from '../../../core/tasks/task-prefill.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { LoadMoreComponent } from '../../../shared/ui/load-more.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { ProjectSectionComponent } from '../components/project-section.component';
import { ProjectSellComponent } from '../components/project-sell.component';
import { RecordLinksComponent } from '../components/record-links.component';
import {
  LinkedRecord,
  ProjectDetail,
  ProjectSale,
  SiteBalance,
} from '../data-access/project.models';
import { ProjectsApiService } from '../data-access/projects-api.service';
import { SiteApiService } from '../data-access/site-api.service';
import {
  attachmentCard,
  budgetStats,
  linkedRows,
  overviewHeading,
  requirementRow,
  siteRow,
  taskCard,
} from './project-view';
import { billedText, saleLinks, sellSection } from './project-sell-view';
import {
  ledgerRows,
  ledgerTitle,
  nextHint,
  recordLinks,
  siteSnapshot,
  taskRows,
  workspaceSubtitle,
} from './workspace-view';

/** Items whose site movements the desktop workspace shows; each costs a few reads. */
const LEDGER_LIMIT = 5;

/** One project: budget against cost, next tasks, material requirements, attachments and linked records. */
@Component({
  selector: 'app-project',
  imports: [
    BackLinkComponent,
    DataTableComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    LoadMoreComponent,
    PageHeadingComponent,
    ProjectSectionComponent,
    ProjectSellComponent,
    RecordLinksComponent,
    StatCardComponent,
    StatusChipComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The desktop workspace spans the page; the phone overview is the task body.
  host: {
    '[class.task]': '!desktop()',
    '[class.desktop]': 'desktop()',
    '[class.tablet]': "viewport() === 'tablet'",
  },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 17px / var(--md-lh) var(--md-font);
    }

    .split {
      gap: 20px;
    }

    .main,
    .side {
      gap: 14px;
    }

    :host(.desktop) .side {
      inline-size: 388px;
    }

    :host(.tablet) .side {
      inline-size: 320px;
    }

    .ledger {
      display: grid;
      gap: 7px;
      padding: 14px;
      border: 1px solid var(--md-line);
      border-radius: 10px;
      background: var(--md-surface);
    }

    .ledger h2 {
      font-size: 15px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
  `,
  template: `
    @let txt = text();
    @if (!desktop() || !view()) {
      <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
      <app-back-link [label]="txt.back" (back)="router.navigate(['/projects'])" />
    }
    @if (!caps().manageProjects && !caps().supplyProjects) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (desktop() && view(); as v) {
      <app-page-heading layout="desktop" [title]="v.heading.title" [subtitle]="v.workspaceSubtitle">
        @if (caps().manageProjects) {
          <button type="button" class="md-btn md-btn--primary" (click)="edit()">
            {{ txt.update }}
          </button>
        }
      </app-page-heading>
      <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
      <div class="split">
        <div class="main">
          @if (caps().manageProjects) {
            <app-stat-card [stats]="v.stats" />
          }
          @if (v.taskRows) {
            <h2>{{ txt.workspaceTasks }}</h2>
            <app-data-table
              [label]="txt.workspaceTasks"
              [headers]="txt.taskHeaders"
              [rows]="v.taskRows"
              [empty]="txt.noTasks"
            />
          }
          <app-project-section
            [heading]="txt.requirements"
            [rows]="v.requirements"
            [empty]="txt.noRequirements"
            [rowsInteractive]="caps().supplyProjects"
            (rowSelected)="supply(v.requirementItems[$event])"
          />
          @for (ledger of ledgers(); track ledger.item) {
            <section class="ledger">
              <h2>{{ ledger.title }}</h2>
              <app-data-table
                [label]="ledger.title"
                [headers]="txt.ledgerHeaders"
                [rows]="ledger.rows"
                [ltrColumns]="[1]"
              />
            </section>
          }
          <div class="actions">
            @if (caps().supplyProjects && v.nextItem) {
              <button type="button" class="md-btn md-btn--primary" (click)="supply(v.nextItem)">
                {{ txt.supply }}
              </button>
            }
            @if (caps().manageProjects) {
              <button type="button" class="md-btn" (click)="addRequirement()">
                {{ txt.addRequirement }}
              </button>
            }
          </div>
        </div>
        <div class="side">
          @if (v.sell; as sell) {
            <app-project-sell
              [heading]="sell.heading"
              [note]="sell.note"
              [notice]="sell.notice"
              [quick]="sell.quick"
              [supply]="sell.supply"
              [addCustomer]="sell.addCustomer"
              (quickSale)="sellTo()"
              (supplyProject)="supply(v.nextItem!)"
              (addCustomerTo)="edit()"
            />
          }
          @if (balancesFailed()) {
            <app-feedback-card
              tone="warning"
              [title]="txt.balancesFailed.title"
              [message]="txt.balancesFailed.message"
            />
            <button type="button" class="md-btn" (click)="retryBalances()">{{ txt.retry }}</button>
          }
          @if (snapshots().length || siteRest().items.length) {
            <h2>{{ txt.siteStock }}</h2>
            @for (snapshot of snapshots(); track snapshot.item) {
              <app-totals-card
                density="compact"
                tone="tint"
                [heading]="snapshot.heading"
                [rows]="snapshot.rows"
              />
              @if (caps().supplyProjects) {
                <button type="button" class="md-btn" (click)="openSite(snapshot.item)">
                  {{ txt.site }}
                </button>
              }
            }
            @if (siteRest().items.length) {
              <app-project-section
                [heading]="txt.site"
                [rows]="siteRest().rows"
                [empty]="''"
                [rowsInteractive]="caps().supplyProjects"
                (rowSelected)="openSite(siteRest().items[$event])"
              />
            }
          }
          @if (v.salesTitle; as salesTitle) {
            <app-record-links
              [heading]="salesTitle"
              [links]="v.sales"
              [empty]="salesEmpty()"
              (opened)="openRecord($event)"
            />
            @if (salesList.status() === 'error') {
              <button type="button" class="md-btn" (click)="salesList.retry()">
                {{ txt.retry }}
              </button>
            }
            <app-load-more
              [hasMore]="salesList.hasMore()"
              [loading]="salesList.loadingMore()"
              [failed]="salesList.moreFailed()"
              (more)="salesList.loadMore()"
            />
            @if (v.billed; as billed) {
              <p class="muted">{{ billed }}</p>
            }
          }
          <app-record-links
            [heading]="txt.records"
            [links]="v.records"
            [empty]="txt.noLinked"
            (opened)="openRecord($event)"
          />
          <app-project-section
            [heading]="txt.attachments"
            [items]="v.attachments"
            [empty]="txt.noAttachments"
          />
          @if (next(); as n) {
            <app-feedback-card [title]="n.title" [message]="n.message" />
          }
        </div>
      </div>
    } @else if (view(); as v) {
      <app-page-heading [title]="v.heading.title" [subtitle]="v.heading.subtitle" />
      <app-status-chip [label]="v.heading.chip.label" [tone]="v.heading.chip.tone" />
      @if (caps().manageProjects) {
        <app-stat-card [stats]="v.stats" />
      }
      @if (caps().supplyProjects && v.nextItem) {
        <button type="button" class="md-btn md-btn--primary" (click)="supply(v.nextItem)">
          {{ txt.supply }}
        </button>
      }
      @if (caps().manageProjects) {
        <button
          type="button"
          class="md-btn"
          [class.md-btn--primary]="!(caps().supplyProjects && v.nextItem)"
          (click)="addRequirement()"
        >
          {{ txt.addRequirement }}
        </button>
        <button type="button" class="md-btn" (click)="edit()">{{ txt.edit }}</button>
      }
      @if (v.sell; as sell) {
        <app-project-sell
          [heading]="sell.heading"
          [note]="sell.note"
          [notice]="sell.notice"
          [quick]="sell.quick"
          [supply]="sell.supply"
          [addCustomer]="sell.addCustomer"
          (quickSale)="sellTo()"
          (supplyProject)="supply(v.nextItem!)"
          (addCustomerTo)="edit()"
        />
      }
      @if (v.tasks) {
        <app-project-section [heading]="txt.tasks" [items]="v.tasks" [empty]="txt.noTasks" />
      }
      <app-project-section
        [heading]="txt.requirements"
        [rows]="v.requirements"
        [empty]="txt.noRequirements"
        [rowsInteractive]="caps().supplyProjects"
        (rowSelected)="supply(v.requirementItems[$event])"
      />
      @if (v.site.length) {
        <app-project-section
          [heading]="txt.site"
          [rows]="v.site"
          [empty]="''"
          [rowsInteractive]="caps().supplyProjects"
          (rowSelected)="openSite(v.siteItems[$event])"
        />
      }
      <app-project-section
        [heading]="txt.attachments"
        [items]="v.attachments"
        [empty]="txt.noAttachments"
      />
      <app-project-section
        [heading]="txt.linked"
        [empty]="txt.noLinked"
        [hasContent]="!!v.linked.length"
      >
        <app-totals-card density="compact" [rows]="v.linked" />
      </app-project-section>
      @if (v.salesTitle; as salesTitle) {
        <app-record-links
          [heading]="salesTitle"
          [links]="v.sales"
          [empty]="salesEmpty()"
          (opened)="openRecord($event)"
        />
        @if (salesList.status() === 'error') {
          <button type="button" class="md-btn" (click)="salesList.retry()">
            {{ txt.retry }}
          </button>
        }
        <app-load-more
          [hasMore]="salesList.hasMore()"
          [loading]="salesList.loadingMore()"
          [failed]="salesList.moreFailed()"
          (more)="salesList.loadMore()"
        />
        @if (v.billed; as billed) {
          <p class="muted">{{ billed }}</p>
        }
      }
      @if (v.records.some((r) => r.openable)) {
        <app-record-links
          [heading]="txt.records"
          [links]="v.records"
          (opened)="openRecord($event)"
        />
      }
    } @else if (failed()) {
      <app-page-heading [title]="txt.title" [subtitle]="name()" />
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load(name())">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class ProjectContainer {
  readonly name = input.required<string>();

  private readonly api = inject(ProjectsApiService);
  private readonly business = inject(BusinessService);
  protected readonly router = inject(Router);
  private readonly siteApi = inject(SiteApiService);
  protected readonly viewport = inject(ViewportService).viewport;
  private readonly session = inject(SessionService);
  private readonly prefills = inject(TaskPrefillService);
  protected readonly caps = this.session.capabilities;
  protected readonly i18n = injectI18n();

  private readonly project = signal<ProjectDetail | null>(null);
  protected readonly salesList = new PagedList<ProjectSale>({ key: (s) => `${s.kind}:${s.name}` });
  /** Site movements per item, for the desktop workspace; read once the project is in. */
  private readonly balances = signal<SiteBalance[]>([]);
  private balancesFor: ProjectDetail | null = null;
  /** A site-movements read failed; the workspace says so rather than look like nothing was delivered. */
  protected readonly balancesFailed = signal(false);
  protected readonly failed = signal(false);
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('project.back'),
      title: t('project.title'),
      tasks: t('project.overview.tasks'),
      noTasks: t('project.overview.noTasks'),
      requirements: t('project.overview.requirements'),
      noRequirements: t('project.overview.noRequirements'),
      site: t('project.overview.site'),
      attachments: t('project.overview.attachments'),
      noAttachments: t('project.overview.noAttachments'),
      linked: t('project.overview.linked'),
      noLinked: t('project.overview.noLinked'),
      noSales: t('project.sell.noSales'),
      ownSales: t('project.sell.ownOnly'),
      salesHeading: t('project.sell.salesHeading'),
      addRequirement: t('project.overview.addRequirement'),
      supply: t('project.overview.supply'),
      edit: t('project.overview.edit'),
      update: t('project.workspace.edit'),
      workspaceTasks: t('project.workspace.tasks'),
      taskHeaders: [
        t('project.workspace.taskHeaders.task'),
        t('project.workspace.taskHeaders.due'),
        t('project.workspace.taskHeaders.status'),
      ],
      ledgerHeaders: [
        t('project.workspace.ledgerHeaders.movement'),
        t('project.workspace.ledgerHeaders.qty'),
        t('project.workspace.ledgerHeaders.balance'),
      ],
      siteStock: t('project.workspace.siteStock'),
      records: t('project.workspace.records'),
      balancesFailed: {
        title: t('project.workspace.balancesFailed.title'),
        message: t('project.workspace.balancesFailed.message'),
      },
      loading: t('project.loading'),
      retry: t('project.retry'),
      noAccess: { title: t('project.noAccess.title'), message: t('project.noAccess.message') },
      loadFailed: {
        title: t('project.overview.loadFailed.title'),
        message: t('project.overview.loadFailed.message'),
      },
    };
  });

  /** "No sales" only once the first page has come: an empty list while it loads would say so wrongly. */
  protected readonly salesEmpty = computed(() => {
    const status = this.salesList.status();
    return status === 'ready'
      ? this.text().noSales
      : status === 'error'
        ? this.text().loadFailed.message
        : '';
  });

  protected readonly view = computed(() => {
    const project = this.project();
    if (!project) {
      return null;
    }
    const tr = this.i18n.tr();
    const language = this.i18n.language();
    const currency = this.business.active()?.currency ?? '';
    const caps = this.caps();
    const nextItem =
      project.requirements.find((r) => r.available < r.required)?.item ??
      project.requirements[0]?.item ??
      null;
    const sales = caps.sell ? project.sales : null;
    // The sales section lists invoices and orders in full, so the generic links leave them out.
    const linked = sales
      ? project.linked.filter((r) => r.kind !== 'sale' && r.kind !== 'order')
      : project.linked;
    return {
      sell: sellSection(
        project,
        { ...caps, supplyProjects: caps.supplyProjects && !!nextItem },
        tr,
      ),
      salesTitle: sales ? tr.t('project.sell.salesHeading') : null,
      sales: sales ? saleLinks(this.salesList.items(), currency, tr) : [],
      billed: sales ? (billedText(sales, currency, tr) ?? this.text().ownSales) : null,
      heading: overviewHeading(project, tr),
      stats: budgetStats(project, currency, tr),
      tasks: project.tasks?.map((task) => taskCard(task, language, tr)) ?? null,
      requirements: project.requirements.map((r) => requirementRow(r, tr)),
      requirementItems: project.requirements.map((r) => r.item),
      // "Review materials and supply" opens the first item stock falls short for, else the first one.
      nextItem:
        project.requirements.find((r) => r.available < r.required)?.item ??
        project.requirements[0]?.item ??
        null,
      site: project.siteItems.map((s) => siteRow(s, tr)),
      siteItems: project.siteItems.map((s) => s.item),
      attachments: project.attachments.map((a) => attachmentCard(a, language)),
      // Order values and expense amounts only for roles that see costs (docs/PERMISSIONS.md).
      linked: linkedRows(linked, this.caps().seeCosts ? currency : null, tr),
      workspaceSubtitle: workspaceSubtitle(project, tr),
      taskRows: project.tasks ? taskRows(project.tasks, language, tr) : null,
      // Madar has pages for sales invoices and purchase orders; both show amounts, so cost roles only.
      records: recordLinks(linked, (r) => this.canOpen(r), tr),
    };
  });

  protected readonly ledgers = computed(() => {
    const tr = this.i18n.tr();
    const project = this.project();
    return this.balances().map((b) => ({
      item: b.item,
      title: ledgerTitle(
        b,
        project?.requirements.find((r) => r.item === b.item)?.required ?? null,
        tr,
      ),
      rows: ledgerRows(b, tr),
    }));
  });

  protected readonly snapshots = computed(() => {
    const tr = this.i18n.tr();
    return this.balances()
      .filter((b) => b.delivered > 0 || b.atSite > 0)
      .map((b) => ({ item: b.item, ...siteSnapshot(b, tr) }));
  });

  /** Site items without a snapshot card (beyond the ledger limit, or whose read failed), as plain rows. */
  protected readonly siteRest = computed(() => {
    const project = this.project();
    const shown = new Set(this.snapshots().map((s) => s.item));
    const rest = (project?.siteItems ?? []).filter((s) => !shown.has(s.item));
    const tr = this.i18n.tr();
    return { items: rest.map((s) => s.item), rows: rest.map((s) => siteRow(s, tr)) };
  });

  protected readonly next = computed(() => nextHint(this.balances(), this.i18n.tr()));

  constructor() {
    effect(() => {
      const name = this.name();
      if (this.caps().manageProjects || this.caps().supplyProjects) {
        untracked(() => void this.load(name));
      }
    });
    // Only the desktop workspace shows site movements; read them when it appears.
    effect(() => {
      const project = this.project();
      if (project && this.desktop() && this.caps().supplyProjects && this.balancesFor !== project) {
        this.balancesFor = project;
        untracked(() => void this.loadBalances(project));
      }
    });
  }

  protected async load(name: string): Promise<void> {
    const run = ++this.run;
    this.project.set(null);
    this.salesList.reset();
    this.balances.set([]);
    this.failed.set(false);
    try {
      await this.business.ensure();
      const company = this.business.active()?.name ?? '';
      const ownOnly = OWN_SALES_ONLY.includes(this.session.persona());
      const owner = this.session.user()?.id ?? null;
      const project = await this.api.project(
        name,
        this.caps().sell && company && (!ownOnly || owner)
          ? { company, owner: ownOnly ? owner : null }
          : undefined,
      );
      if (run === this.run) {
        this.project.set(project);
        if (project.sales) {
          void this.salesList.loadFirst(project.sales.fetch);
        }
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }

  private async loadBalances(project: ProjectDetail): Promise<void> {
    this.balancesFailed.set(false);
    const business = await this.business.ensure().catch(() => null);
    const items = [
      ...new Set([
        ...project.requirements.map((r) => r.item),
        ...project.siteItems.map((s) => s.item),
      ]),
    ].slice(0, LEDGER_LIMIT);
    if (!business) {
      this.balancesFailed.set(this.project() === project);
      return;
    }
    if (!items.length) {
      return;
    }
    let failed = false;
    const balances = await Promise.all(
      items.map((item) =>
        this.siteApi.balance(project.name, item, business.name).catch(() => {
          failed = true;
          return null;
        }),
      ),
    );
    if (this.project() === project) {
      this.balances.set(balances.filter((b): b is SiteBalance => b !== null));
      this.balancesFailed.set(failed);
    }
  }

  protected retryBalances(): void {
    const project = this.project();
    if (project) {
      void this.loadBalances(project);
    }
  }

  private canOpen(record: LinkedRecord): boolean {
    return (record.kind === 'sale' || record.kind === 'purchase') && this.caps().seeCosts;
  }

  protected openRecord(id: string): void {
    const [kind, name] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    const routes: Record<string, string[]> = {
      sale: ['/sales/invoices', name],
      invoice: ['/sales/invoices', name],
      order: ['/sales/orders', name],
    };
    void this.router.navigate(routes[kind] ?? ['/purchases/order', name]);
  }

  protected sellTo(): void {
    const id = this.prefills.put({
      kind: 'quick_sale',
      payload: { project: this.name(), lines: [] },
    });
    void this.router.navigate(['/sales/new', 'items'], id ? { queryParams: { prefill: id } } : {});
  }

  protected supply(item: string): void {
    void this.router.navigate(['/projects', this.name(), 'supply', item]);
  }

  protected openSite(item: string): void {
    void this.router.navigate(['/projects', this.name(), 'site', item]);
  }

  protected addRequirement(): void {
    void this.router.navigate(['/projects', this.name(), 'requirement']);
  }

  protected edit(): void {
    void this.router.navigate(['/projects', this.name(), 'edit']);
  }
}
