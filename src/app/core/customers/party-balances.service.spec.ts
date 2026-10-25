import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { PartyBalancesService } from './party-balances.service';

const company = { name: 'Rehan Nursery', currency: 'ILS' };

describe('PartyBalancesService', () => {
  function setup() {
    TestBed.resetTestingModule();
    const erpnext = fakeErpnext({
      'Sales Invoice': () => [
        {
          customer: 'A',
          party_account_currency: 'ILS',
          conversion_rate: 1,
          'SUM(`outstanding_amount`)': 10,
        },
        {
          customer: 'A',
          party_account_currency: 'USD',
          conversion_rate: 3,
          'SUM(`outstanding_amount`)': 5,
        },
        {
          customer: 'B',
          party_account_currency: 'ILS',
          conversion_rate: 1,
          'SUM(`outstanding_amount`)': 7,
        },
      ],
    });
    return { ...erpnext, service: TestBed.inject(PartyBalancesService) };
  }

  it("sums each party's balances in company currency, scoped to the company", async () => {
    const { service, listCalls } = setup();
    const balances = await service.outstanding(
      'Sales Invoice',
      'customer',
      ['A', 'B'],
      company,
      null,
    );
    expect([...balances]).toEqual([
      ['A', 25],
      ['B', 7],
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['company', '=', 'Rehan Nursery']);
    expect(JSON.stringify(listCalls[0].query.filters)).not.toContain('owner');
  });

  it("limits the balances to the owner's invoices when given", async () => {
    const { service, listCalls } = setup();
    await service.outstanding('Sales Invoice', 'customer', ['A'], company, 'lina@rehan.example');
    expect(listCalls[0].query.filters).toContainEqual(['owner', '=', 'lina@rehan.example']);
  });
});
