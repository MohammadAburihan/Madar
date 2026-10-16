import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { WarehouseDirectoryService } from './warehouse-directory.service';

describe('WarehouseDirectoryService', () => {
  it("lists the company's stock locations by name", async () => {
    const { listCalls } = fakeErpnext({
      Warehouse: () => [{ name: 'Main warehouse - RN', warehouse_name: 'Main warehouse' }],
    });
    expect(await TestBed.inject(WarehouseDirectoryService).list('Rehan Nursery')).toEqual([
      { id: 'Main warehouse - RN', name: 'Main warehouse' },
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['company', '=', 'Rehan Nursery']);
    expect(listCalls[0].query.filters).toContainEqual(['warehouse_type', '!=', 'Transit']);
    // Goods aren't received into the project sites: only project supply moves stock there.
    expect(listCalls[0].query.filters).toContainEqual(['warehouse_name', '!=', 'Project sites']);
  });
});
