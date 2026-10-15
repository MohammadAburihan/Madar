import { TestBed } from '@angular/core/testing';
import { PaymentDetailComponent } from './payment-detail.component';

describe('PaymentDetailComponent', () => {
  it('shows the status, what was paid, the invoice totals and the account', async () => {
    const fixture = TestBed.createComponent(PaymentDetailComponent);
    fixture.componentRef.setInput('view', {
      title: 'Payment recorded',
      subtitle: 'GC-8831 · Green Clay',
      chip: { label: 'Partial payment', tone: 'warning' },
      cardTitle: 'ILS 100.00 recorded',
      cardMessage: 'ILS 170.00 remains outstanding.',
      totals: [{ label: 'Invoice total', value: 'ILS 270.00' }],
      paidFrom: 'Main bank',
    });
    fixture.componentRef.setInput('paidFromLabel', 'Paid from');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-status-chip')?.textContent?.trim()).toBe('Partial payment');
    expect(el.textContent).toContain('ILS 100.00 recorded');
    expect(el.textContent).toContain('ILS 270.00');
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('Main bank');
  });
});
