import { TestBed } from '@angular/core/testing';
import { DataTableComponent } from './data-table.component';
import { TotalsCardComponent } from './totals-card.component';

describe('Data presenters', () => {
  it('DataTable renders headers and rows, keeping amount columns left-to-right', async () => {
    const fixture = TestBed.createComponent(DataTableComponent);
    fixture.componentRef.setInput('label', 'Payments');
    fixture.componentRef.setInput('headers', ['Record', 'Amount']);
    fixture.componentRef.setInput('rows', [{ id: 'PAY-1', cells: ['PAY-1 · Lina', 'ILS 120.00'] }]);
    fixture.componentRef.setInput('ltrColumns', [1]);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('table')?.getAttribute('aria-label')).toBe('Payments');
    expect(Array.from(host.querySelectorAll('th')).map((th) => th.textContent?.trim())).toEqual([
      'Record',
      'Amount',
    ]);
    const cells = Array.from(host.querySelectorAll('td bdi'));
    expect(cells.map((c) => c.textContent?.trim())).toEqual(['PAY-1 · Lina', 'ILS 120.00']);
    expect(cells.map((c) => c.getAttribute('dir'))).toEqual([null, 'ltr']);
    expect(host.querySelector('tbody tr')?.getAttribute('tabindex')).toBeNull();
  });

  it('DataTable shows the empty text, and opens rows only when interactive', async () => {
    const fixture = TestBed.createComponent(DataTableComponent);
    fixture.componentRef.setInput('label', 'Payments');
    fixture.componentRef.setInput('headers', ['Record', 'Amount']);
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('empty', 'No payments recorded yet.');
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('td.empty')?.textContent?.trim()).toBe('No payments recorded yet.');
    expect(host.querySelector('td.empty')?.getAttribute('colspan')).toBe('2');

    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    fixture.componentRef.setInput('rows', [{ id: 'PAY-1', cells: ['PAY-1', 'ILS 1.00'] }]);
    await fixture.whenStable();
    const row = host.querySelector('tbody tr') as HTMLElement;
    row.click();
    expect(opened).toEqual([]);

    fixture.componentRef.setInput('interactive', true);
    await fixture.whenStable();
    expect(row.getAttribute('tabindex')).toBe('0');
    row.click();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(opened).toEqual(['PAY-1', 'PAY-1']);
  });

  it('TotalsCard highlights accent rows and has a compact density', async () => {
    const fixture = TestBed.createComponent(TotalsCardComponent);
    fixture.componentRef.setInput('rows', [
      { label: 'Receive now', value: 'ILS 120.00' },
      { label: 'Due after save', value: 'ILS 80.00', accent: true },
    ]);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(
      Array.from(host.querySelectorAll('dd')).map((dd) => dd.classList.contains('accent')),
    ).toEqual([false, true]);
    expect(host.classList.contains('compact')).toBe(false);

    fixture.componentRef.setInput('density', 'compact');
    await fixture.whenStable();
    expect(host.classList.contains('compact')).toBe(true);

    expect(Array.from(host.querySelectorAll('bdi')).map((b) => b.getAttribute('dir'))).toEqual([
      'ltr',
      'ltr',
    ]);
    fixture.componentRef.setInput('rows', [{ label: 'After use', value: '3 at site', text: true }]);
    await fixture.whenStable();
    expect(host.querySelector('bdi')?.getAttribute('dir')).toBe('auto');

    expect(host.classList.contains('tint')).toBe(false);
    fixture.componentRef.setInput('tone', 'tint');
    await fixture.whenStable();
    expect(host.classList.contains('tint')).toBe(true);
  });
});
