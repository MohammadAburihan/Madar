import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError } from '../../../core/erpnext/confirmation';
import { QuotationApiService } from './quotation-api.service';
import { QuotationRequest } from './quotation.models';

const request = (overrides: Partial<QuotationRequest> = {}): QuotationRequest => ({
  reference: 'QUO-ABC1234',
  company: 'Rehan Nursery',
  currency: 'ILS',
  customer: 'Lina Haddad',
  date: '2026-10-16',
  validTill: '2026-10-30',
  lines: [{ item: 'POT-30', uom: 'Unit', qty: 2, rate: 45 }],
  ...overrides,
});
const api = () => TestBed.inject(QuotationApiService);

describe('QuotationApiService', () => {
  it('inserts and submits the quotation with its Madar reference in utm_content', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'QT-1' }),
        'frappe.client.submit': () => ({ name: 'QT-1' }),
      },
    );
    const inserted: string[] = [];
    expect(await api().confirm(request(), null, (n) => inserted.push(n))).toBe('QT-1');
    expect(inserted).toEqual(['QT-1']);
    expect(postCalls[0].body['doc']).toMatchObject({
      doctype: 'Quotation',
      quotation_to: 'Customer',
      party_name: 'Lina Haddad',
      valid_till: '2026-10-30',
      utm_content: 'QUO-ABC1234',
      items: [{ item_code: 'POT-30', qty: 2, rate: 45 }],
    });
  });

  it('takes a remembered posted draft as the result only when it matches', async () => {
    const posted = {
      name: 'QT-1',
      docstatus: 1,
      party_name: 'Lina Haddad',
      items: [{ item_code: 'POT-30', qty: 2, rate: 45 }],
    };
    const { postCalls } = fakeErpnext({}, {}, { 'Quotation/QT-1': posted });
    expect(await api().confirm(request(), 'QT-1')).toBe('QT-1');
    expect(postCalls).toEqual([]);
    await expect(
      api().confirm(
        request({ lines: [{ item: 'POT-30', uom: 'Unit', qty: 3, rate: 45 }] }),
        'QT-1',
      ),
    ).rejects.toBeInstanceOf(PostedEarlierError);
  });

  it('finds a quotation by its reference, telling a draft from a confirmed one', async () => {
    let rows: unknown[] = [];
    const { listCalls } = fakeErpnext({ Quotation: () => rows });
    expect(await api().find('QUO-ABC1234')).toBe('not-found');
    rows = [{ name: 'QT-1', docstatus: 0 }];
    expect(await api().find('QUO-ABC1234')).toEqual({ draft: 'QT-1' });
    expect(listCalls[0].query.filters).toContainEqual(['utm_content', '=', 'QUO-ABC1234']);
  });

  it('reads a quotation with its rounded total', async () => {
    fakeErpnext(
      {},
      {},
      {
        'Quotation/QT-1': {
          name: 'QT-1',
          docstatus: 1,
          status: 'Open',
          party_name: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          transaction_date: '2026-10-16',
          valid_till: '2026-10-30',
          base_grand_total: 89.97,
          base_rounded_total: 90,
          items: [
            {
              item_code: 'POT-30',
              item_name: 'Ceramic planter',
              qty: 2,
              uom: 'Unit',
              rate: 12.15,
              base_rate: 44.985,
              base_amount: 89.97,
            },
          ],
        },
      },
    );
    const quotation = await api().quotation('QT-1');
    expect(quotation).toMatchObject({ total: 90, customerName: 'Lina Haddad' });
    // In the company currency, like the total, whatever currency the quotation was made in.
    expect(quotation.lines[0]).toMatchObject({ rate: 44.985, amount: 89.97 });
  });
});
