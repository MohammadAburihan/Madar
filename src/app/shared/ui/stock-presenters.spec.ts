import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HistoryListComponent } from './history-list.component';
import { StatCardComponent } from './stat-card.component';
import { TotalsCardComponent } from './totals-card.component';

async function render<T>(component: Type<T>, inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const texts = (el: HTMLElement, selector: string) =>
  [...el.querySelectorAll(selector)].map((n) => n.textContent?.trim());

describe('stock presenters', () => {
  it('StatCard shows each figure under its label', async () => {
    const el = await render(StatCardComponent, {
      stats: [
        { label: 'Locations', value: '2' },
        { label: 'Moves today', value: '5' },
      ],
    });
    expect(texts(el, 'dt')).toEqual(['Locations', 'Moves today']);
    expect(texts(el, 'dd')).toEqual(['2', '5']);
  });

  it('HistoryList shows each event with its detail, or the empty text', async () => {
    const el = await render(HistoryListComponent, {
      label: 'Recent movement history',
      entries: [
        { title: 'Moved 2 Unit Olive tree', meta: 'Today · Main to Shop' },
        { title: 'Count adjustment +3', meta: '9 Oct 2026 · Main' },
      ],
    });
    expect(el.querySelector('ul')!.getAttribute('aria-label')).toBe('Recent movement history');
    expect(texts(el, '.title')).toEqual(['Moved 2 Unit Olive tree', 'Count adjustment +3']);
    expect(texts(el, '.meta')).toEqual(['Today · Main to Shop', '9 Oct 2026 · Main']);

    const empty = await render(HistoryListComponent, {
      label: 'History',
      entries: [],
      empty: 'No movements yet.',
    });
    expect(texts(empty, 'li')).toEqual(['No movements yet.']);
  });

  it('TotalsCard shows an optional heading above the rows', async () => {
    const el = await render(TotalsCardComponent, {
      heading: '2 Unit · Main to Shop',
      rows: [{ label: 'Main', value: '24 → 22' }],
    });
    expect(el.querySelector('.heading')?.textContent?.trim()).toBe('2 Unit · Main to Shop');
    expect(texts(el, '.row dt')).toEqual(['Main']);

    const plain = await render(TotalsCardComponent, { rows: [{ label: 'Main', value: '1' }] });
    expect(plain.querySelector('.heading')).toBeNull();
  });
});
