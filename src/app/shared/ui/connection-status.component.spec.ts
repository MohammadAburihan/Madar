import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConnectionStatusComponent, ConnectionStatus } from './connection-status.component';

describe('ConnectionStatusComponent', () => {
  const render = async (status: ConnectionStatus) => {
    TestBed.configureTestingModule({
      imports: [
        ConnectionStatusComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              connection: {
                checking: 'Checking',
                online: 'Connected',
                offline: 'Offline',
                retry: 'Try again',
              },
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    });
    const fixture = TestBed.createComponent(ConnectionStatusComponent);
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    return fixture;
  };

  it('labels each status and offers retry only when offline', async () => {
    const online = await render('online');
    expect(online.nativeElement.querySelector('ion-label').textContent).toBe('Connected');
    expect(online.nativeElement.querySelector('ion-chip').color).toBe('success');
    expect(online.nativeElement.querySelector('ion-button')).toBeNull();
  });

  it('emits retry from the offline state', async () => {
    TestBed.resetTestingModule();
    const offline = await render('offline');
    let retried = 0;
    offline.componentInstance.retry.subscribe(() => retried++);

    offline.nativeElement.querySelector('ion-button').click();

    expect(offline.nativeElement.querySelector('ion-label').textContent).toBe('Offline');
    expect(retried).toBe(1);
  });
});
