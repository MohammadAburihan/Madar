import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { QuickActionsComponent } from './quick-actions.component';

describe('QuickActionsComponent', () => {
  let fixture: ComponentFixture<QuickActionsComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [
        QuickActionsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: { home: { actions: { sell: 'Sell', buy: 'Buy' } } } },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    });
    fixture = TestBed.createComponent(QuickActionsComponent);
    fixture.componentRef.setInput('actions', [
      { id: 'sell', icon: 'cart-outline' },
      { id: 'buy', icon: 'bag-handle-outline' },
    ]);
    await fixture.whenStable();
  });

  it('renders a translated button per action', () => {
    const labels = [...fixture.nativeElement.querySelectorAll('button')].map((b: HTMLElement) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(['Sell', 'Buy']);
  });

  it('emits the selected action id', () => {
    const selected: string[] = [];
    fixture.componentInstance.actionSelected.subscribe((id) => selected.push(id));

    fixture.nativeElement.querySelectorAll('button')[1].click();

    expect(selected).toEqual(['buy']);
  });
});
