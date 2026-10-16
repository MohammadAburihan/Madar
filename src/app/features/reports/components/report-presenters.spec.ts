import { TestBed } from '@angular/core/testing';
import { MetricCardsComponent } from './metric-cards.component';
import { MoneyCardComponent } from './money-card.component';
import { ProfitCardComponent } from './profit-card.component';

const TEXT = {
  moneyIn: 'Money in',
  moneyOut: 'Money out',
  net: 'Net for the period',
  byAccount: 'By account',
  in: 'In',
  out: 'Out',
  noAccounts: 'No money moved.',
  lastMonths: 'Last 3 months · ILS',
  link: 'Payments in this period',
};

describe('report presenters', () => {
  it('ProfitCard shows the figure, its rows and an optional link', async () => {
    const fixture = TestBed.createComponent(ProfitCardComponent);
    fixture.componentRef.setInput('label', 'Profit');
    fixture.componentRef.setInput('amount', 'ILS 6,270.00');
    fixture.componentRef.setInput('rows', [{ label: 'Sales income', value: 'ILS 18,450.00' }]);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.amount')?.textContent).toBe('ILS 6,270.00');
    expect(host.querySelector('dt')?.textContent).toBe('Sales income');
    expect(host.querySelector('button')).toBeNull();

    let opened = 0;
    fixture.componentInstance.linkSelected.subscribe(() => opened++);
    fixture.componentRef.setInput('link', 'Profit by month · last 3 months');
    await fixture.whenStable();
    host.querySelector('button')!.click();
    expect(opened).toBe(1);
  });

  it('MoneyCard lists each account and a bar per month, and opens payments', async () => {
    const fixture = TestBed.createComponent(MoneyCardComponent);
    fixture.componentRef.setInput('text', TEXT);
    fixture.componentRef.setInput('view', {
      moneyIn: 'ILS 15,920.00',
      moneyOut: 'ILS 11,640.00',
      net: '+ ILS 4,280.00',
      accounts: [{ name: 'Main cash', moneyIn: '8,450.00', moneyOut: '2,310.00' }],
      bars: [
        { label: 'Oct', moneyIn: '15,920.00', moneyOut: '11,640.00', inShare: 1, outShare: 0.7 },
      ],
    });
    let opened = 0;
    fixture.componentInstance.linkSelected.subscribe(() => opened++);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('Main cash');
    expect(host.querySelectorAll('.month')).toHaveLength(1);
    expect((host.querySelector('.bar .in') as HTMLElement).style.inlineSize).toBe('75%');
    host.querySelector('button')!.click();
    expect(opened).toBe(1);
  });

  it('MoneyCard says when no account moved money', async () => {
    const fixture = TestBed.createComponent(MoneyCardComponent);
    fixture.componentRef.setInput('text', TEXT);
    fixture.componentRef.setInput('view', {
      moneyIn: 'ILS 0.00',
      moneyOut: 'ILS 0.00',
      net: '+ ILS 0.00',
      accounts: [],
      bars: [],
    });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No money moved.');
  });

  it('MetricCards tints the headline figure', async () => {
    const fixture = TestBed.createComponent(MetricCardsComponent);
    fixture.componentRef.setInput('metrics', [
      { label: 'Profit', value: 'ILS 1.00', hint: 'Income − costs', tint: true },
      { label: 'Money in', value: 'ILS 2.00', hint: 'Main cash 2.00', tint: false },
    ]);
    await fixture.whenStable();
    const cards = fixture.nativeElement.querySelectorAll('.card');
    expect(Array.from(cards).map((c) => (c as HTMLElement).classList.contains('tint'))).toEqual([
      true,
      false,
    ]);
  });
});
