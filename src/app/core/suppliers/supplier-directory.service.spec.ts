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

  it('finds suppliers by exact id or name, disabled ones included and marked', async () => {
    const { listCalls } = fakeErpnext({
      Supplier: () => [
        {
          name: 'SUP-1',
          supplier_name: 'Green Clay',
          primary_address: 'Hebron<br>Main St',
          disabled: 1,
        },
      ],
    });
    expect(await TestBed.inject(SupplierDirectoryService).exact('Green Clay')).toEqual([
      { id: 'SUP-1', name: 'Green Clay', city: 'Hebron', disabled: true },
    ]);
    expect(listCalls[0].query.orFilters).toEqual([
      ['name', '=', 'Green Clay'],
      ['supplier_name', '=', 'Green Clay'],
    ]);
    expect(listCalls[0].query.filters).toBeUndefined();
  });
});
