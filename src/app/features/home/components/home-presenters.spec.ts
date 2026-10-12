import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AttentionCardsComponent } from './attention-cards.component';
import { AttentionTableComponent } from './attention-table.component';
import { GlancePanelComponent } from './glance-panel.component';
import { HomeHeaderComponent } from './home-header.component';

const EMPTY = { title: 'Nothing needs your attention', message: 'New work will appear here.' };
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

async function render<T>(component: Type<T>, inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('Home presenters', () => {
  it('HomeHeader shows the greeting and emits createNew', async () => {
    const fixture = await render(HomeHeaderComponent, {
      title: 'Good morning, Rehan',
      subtitle: 'Owner · Sunday, 11 October',
      newLabel: '+ New',
      layout: 'desktop',
    });
    let created = 0;
    fixture.componentInstance.createNew.subscribe(() => created++);
    const el: HTMLElement = fixture.nativeElement;

    el.querySelector('button')!.click();

    expect(text(el.querySelector('h1'))).toBe('Good morning, Rehan');
    expect(text(el.querySelector('p'))).toBe('Owner · Sunday, 11 October');
    expect(el.classList).toContain('desktop');
    expect(created).toBe(1);
  });

  it('AttentionCards lists cards, or the empty state', async () => {
    const fixture = await render(AttentionCardsComponent, {
      cards: [
        { title: '2 unfinished drafts', message: 'Sale for Lina Haddad · Updated 10 min ago' },
      ],
      empty: EMPTY,
    });
    expect(text(fixture.nativeElement)).toContain('2 unfinished drafts');

    fixture.componentRef.setInput('cards', []);
    await fixture.whenStable();
    expect(text(fixture.nativeElement)).toContain(EMPTY.title);
  });

  it('AttentionTable renders an accessible table of rows', async () => {
    const fixture = await render(AttentionTableComponent, {
      headers: { work: 'Work', due: 'Due', next: 'Next action' },
      rows: [{ work: 'PO-2048 · Green Clay', due: 'Today', next: 'Receive delivery' }],
      empty: EMPTY,
    });
    const el: HTMLElement = fixture.nativeElement;

    expect([...el.querySelectorAll('[role=columnheader]')].map(text)).toEqual([
      'Work',
      'Due',
      'Next action',
    ]);
    expect(
      [...el.querySelectorAll('[role=row]')].map((row) => [...row.children].map(text)),
    ).toEqual([
      ['Work', 'Due', 'Next action'],
      ['PO-2048 · Green Clay', 'Today', 'Receive delivery'],
    ]);

    fixture.componentRef.setInput('rows', []);
    await fixture.whenStable();
    expect(el.querySelector('[role=table]')).toBeNull();
    expect(text(el)).toContain(EMPTY.title);
  });

  it('GlancePanel shows amounts as left-to-right runs', async () => {
    const fixture = await render(GlancePanelComponent, {
      heading: 'Today at a glance',
      cards: [
        { title: 'ILS 1,280.00', message: 'Confirmed sales today', numeric: true },
        { title: '3 low-stock items', message: 'Main warehouse' },
      ],
      note: 'All summaries belong to Rehan Nursery.',
    });
    const titles: HTMLElement[] = [...fixture.nativeElement.querySelectorAll('.title')];

    expect(text(fixture.nativeElement.querySelector('h2'))).toBe('Today at a glance');
    expect(titles.map((t) => t.getAttribute('dir'))).toEqual(['ltr', null]);
    expect(text(fixture.nativeElement.querySelector('.note'))).toBe(
      'All summaries belong to Rehan Nursery.',
    );
  });
});
