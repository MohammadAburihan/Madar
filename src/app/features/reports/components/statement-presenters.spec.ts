import { TestBed } from '@angular/core/testing';
import { StatementEntriesComponent } from './statement-entries.component';
import { StatementLinksComponent } from './statement-links.component';

describe('statement presenters', () => {
  it('StatementEntries opens the entries that have a page', async () => {
    const fixture = TestBed.createComponent(StatementEntriesComponent);
    fixture.componentRef.setInput('entries', [
      {
        id: 'SI-1',
        title: 'Invoice SI-1',
        date: '02/09/2026',
        amount: 'ILS 150.00',
        balance: 'Balance 150.00',
        openable: true,
      },
      {
        id: 'PAY-1',
        title: 'Payment PAY-1',
        date: '09/09/2026',
        amount: '− ILS 150.00',
        balance: 'Balance 0.00',
        openable: false,
      },
    ]);
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('button.entry')).toHaveLength(1);
    expect(host.querySelectorAll('div.entry')).toHaveLength(1);
    expect(host.textContent).toContain('Balance 0.00');
    (host.querySelector('button.entry') as HTMLElement).click();
    expect(opened).toEqual(['SI-1']);
  });

  it('StatementLinks opens the chosen statement', async () => {
    const fixture = TestBed.createComponent(StatementLinksComponent);
    fixture.componentRef.setInput('links', [
      {
        id: 'customer',
        title: 'Customer statement',
        message: 'For one customer',
        action: 'Choose a customer first',
      },
      { id: 'supplier', title: 'Supplier statement', message: 'For one supplier', action: null },
    ]);
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].textContent).toContain('Choose a customer first');
    buttons[1].click();
    expect(opened).toEqual(['supplier']);
  });
});
