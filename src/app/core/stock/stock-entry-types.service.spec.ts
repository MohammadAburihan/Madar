import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { StockEntryTypesService } from './stock-entry-types.service';

const types = () => TestBed.inject(StockEntryTypesService);

describe('StockEntryTypesService', () => {
  it('links to the standard type named in the site language, read once per purpose', async () => {
    const { listCalls } = fakeErpnext({ 'Stock Entry Type': () => [{ name: 'صرف مواد' }] });
    expect(await types().withType({ purpose: 'Material Issue', items: [] })).toEqual({
      purpose: 'Material Issue',
      items: [],
      stock_entry_type: 'صرف مواد',
    });
    await types().name('Material Issue');
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0].query.filters).toEqual([
      ['purpose', '=', 'Material Issue'],
      ['is_standard', '=', 1],
    ]);
  });

  it('falls back to the English name when there is none or the role may not read types', async () => {
    fakeErpnext({ 'Stock Entry Type': () => [] });
    expect(await types().name('Material Receipt')).toBe('Material Receipt');
    TestBed.resetTestingModule();
    fakeErpnext({
      'Stock Entry Type': () => throwError(() => new HttpErrorResponse({ status: 403 })),
    });
    expect(await types().name('Material Transfer')).toBe('Material Transfer');
    TestBed.resetTestingModule();
    fakeErpnext({
      'Stock Entry Type': () => throwError(() => new HttpErrorResponse({ status: 0 })),
    });
    await expect(types().name('Material Transfer')).rejects.toBeTruthy();
  });
});
