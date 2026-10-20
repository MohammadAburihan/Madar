import { Injectable, inject, signal } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { HomeApiService } from './home-api.service';
import { HomeData } from './home.models';

export type HomeStatus = 'loading' | 'ready' | 'offline' | 'error' | 'expired' | 'signed-out';

@Injectable({ providedIn: 'root' })
export class HomeFacade {
  private readonly api = inject(HomeApiService);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);

  private readonly currentStatus = signal<HomeStatus>('loading');
  private readonly currentData = signal<HomeData | null>(null);
  private readonly loadedAt = signal(new Date());
  private latestLoad = 0;
  /** User the running load is for, so a session restored mid-load doesn't start a second one. */
  private loadingFor: string | null = null;

  readonly status = this.currentStatus.asReadonly();
  readonly data = this.currentData.asReadonly();
  /** Site wall-clock time of the last successful load. */
  readonly now = this.loadedAt.asReadonly();

  /** Loads Home for the given user unless a load for them is already running. */
  loadFor(userId: string | undefined): Promise<void> {
    return userId && userId === this.loadingFor ? Promise.resolve() : this.load();
  }

  async load(): Promise<void> {
    const loadId = ++this.latestLoad;
    const isCurrent = () => loadId === this.latestLoad;
    this.currentStatus.set('loading');
    try {
      // The route guard lets the shell through when ERPNext is unreachable, so the user may be unknown here.
      if (!this.session.user() && !(await this.session.ensure())) {
        if (isCurrent()) {
          this.currentStatus.set(this.session.status() === 'expired' ? 'expired' : 'signed-out');
        }
        return;
      }
      const user = this.session.user()!;
      this.loadingFor = user.id;
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        if (isCurrent()) {
          this.currentStatus.set('error');
        }
        return;
      }
      const today = this.clock.now();
      const result = await this.api.load({
        persona: this.session.persona(),
        company: business.name,
        companyAbbr: business.abbr,
        companyCurrency: business.currency,
        userId: user.id,
        today,
        buying: {
          orders: this.session.capabilities().orderPurchases,
          payments: this.session.capabilities().paySuppliers,
        },
      });
      const expired = result.allForbidden && (await this.session.checkExpired());
      if (!isCurrent()) {
        return;
      }
      if (expired) {
        this.currentStatus.set('expired');
        return;
      }
      this.loadedAt.set(today);
      this.currentData.set(result.data);
      this.currentStatus.set('ready');
    } catch (error) {
      const kind = ErpnextError.from(error).kind;
      // One check decides: a 401/403 only means "expired" if ERPNext no longer knows the session.
      const expired =
        (kind === 'unauthorized' || kind === 'forbidden') && (await this.session.checkExpired());
      if (isCurrent()) {
        this.currentStatus.set(expired ? 'expired' : kind === 'offline' ? 'offline' : 'error');
      }
    } finally {
      if (isCurrent()) {
        this.loadingFor = null;
      }
    }
  }
}
