import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { SupplierDirectoryService } from './supplier-directory.service';

describe('SupplierDirectoryService', () => {
  it('lists every enabled supplier with the city from its address', async () => {
    const { listCalls } = fakeErpnext({
      Supplier: () => [
        { name: 'SUP-1', supplier_name: 'Green Clay', primary_address: 'Hebron<br>Main St' },
        { name: 'SUP-2', supplier_name: 'Olive Co', primary_address: null },
      ],
    });
    expect(await TestBed.inject(SupplierDirectoryService).list()).toEqual([
      { id: 'SUP-1', name: 'Green Clay', city: 'Hebron' },
      { id: 'SUP-2', name: 'Olive Co', city: null },
    ]);
    expect(listCalls[0].query.limit).toBeUndefined();
  });
});
