import { TestBed } from '@angular/core/testing';
import { DraftsListComponent } from './drafts-list.component';

const EMPTY = { title: 'Nothing unfinished', message: 'Drafts you save show up here.' };
const CARDS = [
  {
    id: 'sale:SI-1',
    title: 'Sale for Lina Haddad',
    meta: 'ILS 320.00 · 3 units · Updated 10 min ago',
    action: 'Continue sale',
    primary: true,
    deletable: true,
    deleteLabel: 'Delete draft',
  },
  {
    id: 'purchase:PO-1',
    title: 'Purchase from Green Clay',
    meta: '10 units · Updated 1 day ago',
    action: 'Continue purchase',
    primary: false,
    deletable: false,
    deleteLabel: 'Delete draft',
  },
];
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

async function render(cards: unknown) {
  const fixture = TestBed.createComponent(DraftsListComponent);
  fixture.componentRef.setInput('cards', cards);
  fixture.componentRef.setInput('empty', EMPTY);
  await fixture.whenStable();
  return fixture;
}

describe('DraftsListComponent', () => {
  it('shows a card per draft with its title, meta and button', async () => {
    const fixture = await render(CARDS);
    const cards = [...fixture.nativeElement.querySelectorAll('app-feedback-card')] as HTMLElement[];

    expect(cards.map((c) => text(c.querySelector('.title')))).toEqual([
      'Sale for Lina Haddad',
      'Purchase from Green Clay',
    ]);
    expect(cards.map((c) => text(c.querySelector('.message')))).toEqual([
      'ILS 320.00 · 3 units · Updated 10 min ago',
      '10 units · Updated 1 day ago',
    ]);
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLElement[];
    expect(buttons.map(text)).toEqual(['Continue sale', 'Delete draft', 'Continue purchase']);
    expect(buttons.map((b) => b.classList.contains('md-btn--primary'))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('emits the id of the draft whose button was pressed', async () => {
    const fixture = await render(CARDS);
    const continued: string[] = [];
    fixture.componentInstance.continued.subscribe((id) => continued.push(id));

    (fixture.nativeElement.querySelectorAll('button')[2] as HTMLElement).click();

    expect(continued).toEqual(['purchase:PO-1']);
  });

  it('shows Delete only on cards that allow it, and emits that card for it', async () => {
    const fixture = await render(CARDS);
    const asked: string[] = [];
    fixture.componentInstance.deleteAsked.subscribe((id) => asked.push(id));

    const deletes = [...fixture.nativeElement.querySelectorAll('button.md-btn--danger')];
    expect(deletes.map(text)).toEqual(['Delete draft']);
    (deletes[0] as HTMLElement).click();

    expect(asked).toEqual(['sale:SI-1']);
  });

  it('disables Delete while a delete is running', async () => {
    const fixture = await render(CARDS);
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('button.md-btn--danger').disabled).toBe(true);
  });

  it('shows the empty state when there are no drafts', async () => {
    const fixture = await render([]);
    expect(text(fixture.nativeElement)).toContain('Nothing unfinished');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
