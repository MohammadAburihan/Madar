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

  it('reads every supplier a spelling of a name could match, disabled ones marked, up to the cap', async () => {
    const { listCalls } = fakeErpnext({
      Supplier: () => [{ name: 'SUP-3', supplier_name: 'Old Kiln', disabled: 1 }],
    });
    const found = await TestBed.inject(SupplierDirectoryService).spelledLike('oldkiln');
    expect(found).toEqual({
      rows: [{ id: 'SUP-3', name: 'Old Kiln', disabled: true }],
      capped: false,
    });
    expect(listCalls[0].query.filters).toBeUndefined();
    expect(listCalls[0].query.orFilters).toContainEqual([
      'supplier_name',
      'like',
      '%o%l%d%k%i%l%n%',
    ]);
    expect(listCalls[0].maxRows).toBe(1000);
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
