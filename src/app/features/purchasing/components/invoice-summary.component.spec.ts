import { TestBed } from '@angular/core/testing';
import { InvoiceSummaryComponent } from './invoice-summary.component';

describe('InvoiceSummaryComponent', () => {
  const render = async (payments?: { title: string; message: string }[]) => {
    const fixture = TestBed.createComponent(InvoiceSummaryComponent);
    fixture.componentRef.setInput('chips', [
      { label: 'Invoice: Confirmed', tone: 'tint' },
      { label: 'Payment: Partially paid', tone: 'warning' },
    ]);
    fixture.componentRef.setInput('totals', [
      { label: 'Invoice total', value: 'ILS 270.00' },
      { label: 'Outstanding', value: 'ILS 170.00', accent: true },
    ]);
    if (payments) {
      fixture.componentRef.setInput('payments', payments);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the status chips and the totals', async () => {
    const el = await render();
    const chips = [...el.querySelectorAll('app-status-chip')].map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Invoice: Confirmed', 'Payment: Partially paid']);
    expect(el.textContent).toContain('ILS 270.00');
    expect(el.querySelector('app-feedback-card')).toBeNull();
  });

  it('shows one card per linked payment', async () => {
    const el = await render([
      { title: 'Linked payment PAY-0155', message: 'ILS 100.00 paid from Main bank.' },
    ]);
    expect(el.querySelectorAll('app-feedback-card').length).toBe(1);
    expect(el.textContent).toContain('Linked payment PAY-0155');
  });
});
