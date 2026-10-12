import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  cartOutline,
  bagHandleOutline,
  cashOutline,
  walletOutline,
  receiptOutline,
  swapHorizontalOutline,
  constructOutline,
} from 'ionicons/icons';
import { Language, LanguageService } from '../../../core/i18n/language.service';
import { ConnectionStatusComponent } from '../../../shared/ui/connection-status.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { QuickAction, QuickActionsComponent } from '../components/quick-actions.component';
import { HomeFacade } from '../data-access/home.facade';

const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'sell', icon: 'cart-outline' },
  { id: 'buy', icon: 'bag-handle-outline' },
  { id: 'receivePayment', icon: 'cash-outline' },
  { id: 'paySupplier', icon: 'wallet-outline' },
  { id: 'recordExpense', icon: 'receipt-outline' },
  { id: 'transferStock', icon: 'swap-horizontal-outline' },
  { id: 'supplyProject', icon: 'construct-outline' },
];

@Component({
  selector: 'app-home-container',
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    TranslocoPipe,
    ConnectionStatusComponent,
    LanguageSwitcherComponent,
    QuickActionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>{{ 'app.name' | transloco }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="top">
        <app-connection-status [status]="facade.backendStatus()" (retry)="facade.checkBackend()" />
        <app-language-switcher
          [language]="languageService.language()"
          (languageChange)="changeLanguage($event)"
        />
      </div>

      <h2>{{ 'home.quickActions' | transloco }}</h2>
      <app-quick-actions [actions]="quickActions" (actionSelected)="openAction()" />
    </ion-content>
  `,
  styles: `
    .top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }
  `,
})
export class HomeContainer implements OnInit {
  protected readonly facade = inject(HomeFacade);
  protected readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastController);
  private readonly transloco = inject(TranslocoService);

  protected readonly quickActions = QUICK_ACTIONS;

  constructor() {
    addIcons({
      cartOutline,
      bagHandleOutline,
      cashOutline,
      walletOutline,
      receiptOutline,
      swapHorizontalOutline,
      constructOutline,
    });
  }

  ngOnInit(): void {
    this.facade.checkBackend();
  }

  protected changeLanguage(language: Language): void {
    void this.languageService.use(language);
  }

  // Placeholder until the workflow screens exist.
  protected async openAction(): Promise<void> {
    const toast = await this.toasts.create({
      message: this.transloco.translate('home.comingSoon'),
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }
}
