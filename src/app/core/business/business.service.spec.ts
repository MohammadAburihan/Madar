import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { BusinessService } from './business.service';

describe('BusinessService', () => {
  it('shares one Company request between a refresh and a concurrent ensure', async () => {
    const list = vi.fn(() =>
      of([{ name: 'Rehan Nursery', default_currency: 'ILS', abbr: 'RN' }]).pipe(delay(5)),
    );
    TestBed.configureTestingModule({ providers: [{ provide: ErpnextClient, useValue: { list } }] });
    const business = TestBed.inject(BusinessService);

    const [refreshed, ensured] = await Promise.all([business.refresh(), business.ensure()]);

    expect(list).toHaveBeenCalledTimes(1);
    expect(refreshed?.name).toBe('Rehan Nursery');
    expect(ensured?.name).toBe('Rehan Nursery');
  });
});
