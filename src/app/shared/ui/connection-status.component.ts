import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonButton, IonChip, IonIcon, IonLabel } from '@ionic/angular';
import { TranslocoPipe } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import { cloudDoneOutline, cloudOfflineOutline, syncOutline } from 'ionicons/icons';

export type ConnectionStatus = 'checking' | 'online' | 'offline';

const ICONS: Record<ConnectionStatus, string> = {
  checking: 'sync-outline',
  online: 'cloud-done-outline',
  offline: 'cloud-offline-outline',
};

const COLORS: Record<ConnectionStatus, string> = {
  checking: 'medium',
  online: 'success',
  offline: 'danger',
};

@Component({
  selector: 'app-connection-status',
  imports: [IonButton, IonChip, IonIcon, IonLabel, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-chip [color]="colors[status()]" role="status">
      <ion-icon [name]="icons[status()]" aria-hidden="true" />
      <ion-label>{{ 'connection.' + status() | transloco }}</ion-label>
    </ion-chip>
    @if (status() === 'offline') {
      <ion-button fill="clear" size="small" (click)="retry.emit()">
        {{ 'connection.retry' | transloco }}
      </ion-button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
  `,
})
export class ConnectionStatusComponent {
  readonly status = input.required<ConnectionStatus>();
  readonly retry = output<void>();

  protected readonly icons = ICONS;
  protected readonly colors = COLORS;

  constructor() {
    addIcons({ syncOutline, cloudDoneOutline, cloudOfflineOutline });
  }
}
