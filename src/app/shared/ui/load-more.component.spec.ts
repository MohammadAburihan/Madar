import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { LoadMoreComponent } from './load-more.component';

describe('LoadMoreComponent', () => {
  let fixture: ComponentFixture<LoadMoreComponent>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
  const button = (): HTMLButtonElement | null => fixture.nativeElement.querySelector('button');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        LoadMoreComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              paging: {
                more: 'Show more',
                loading: 'Loading more…',
                failed: 'Could not load more',
                retry: 'Try again',
              },
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    });
    fixture = TestBed.createComponent(LoadMoreComponent);
  });

  it('shows nothing when there is no more', async () => {
    await fixture.whenStable();
    expect(text()).toBe('');
  });

  it('offers a Show more button that emits more', async () => {
    fixture.componentRef.setInput('hasMore', true);
    await fixture.whenStable();
    const emitted: unknown[] = [];
    fixture.componentInstance.more.subscribe(() => emitted.push(1));

    expect(button()?.textContent?.trim()).toBe('Show more');
    button()?.click();
    expect(emitted.length).toBe(1);
  });

  it('keeps the button while loading, disabled and busy, and announces loading in a live region', async () => {
    fixture.componentRef.setInput('hasMore', true);
    await fixture.whenStable();
    const live = (): HTMLElement => fixture.nativeElement.querySelector('[aria-live="polite"]');
    expect(live().textContent?.trim()).toBe('');
    const before = button();

    fixture.componentRef.setInput('loading', true);
    await fixture.whenStable();

    expect(button()).toBe(before);
    expect(button()?.textContent?.trim()).toBe('Show more');
    expect(button()?.disabled).toBe(true);
    expect(button()?.getAttribute('aria-busy')).toBe('true');
    expect(live().textContent?.trim()).toBe('Loading more…');
  });

  it('does not watch the scroll position when autoLoad is off', async () => {
    let created = 0;
    const original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor() {
        created++;
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    try {
      fixture.componentRef.setInput('hasMore', true);
      fixture.componentRef.setInput('autoLoad', false);
      await fixture.whenStable();
      expect(created).toBe(0);
      expect(button()?.textContent?.trim()).toBe('Show more');
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });

  it('says it failed and retries through the same output', async () => {
    fixture.componentRef.setInput('hasMore', true);
    fixture.componentRef.setInput('failed', true);
    await fixture.whenStable();
    const emitted: unknown[] = [];
    fixture.componentInstance.more.subscribe(() => emitted.push(1));

    expect(text()).toContain('Could not load more');
    button()?.click();
    expect(emitted.length).toBe(1);
  });

  it('asks for the next page when its end scrolls into view', async () => {
    let notify: IntersectionObserverCallback = () => undefined;
    const original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    try {
      fixture.componentRef.setInput('hasMore', true);
      await fixture.whenStable();
      const emitted: unknown[] = [];
      fixture.componentInstance.more.subscribe(() => emitted.push(1));

      notify(
        [{ isIntersecting: false }] as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      );
      expect(emitted.length).toBe(0);
      notify([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
      expect(emitted.length).toBe(1);
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});
