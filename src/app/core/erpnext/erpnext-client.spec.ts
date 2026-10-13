import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ErpnextClient } from './erpnext-client';

describe('ErpnextClient', () => {
  it('pages through listAll until a short page arrives', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const client = TestBed.inject(ErpnextClient);
    const http = TestBed.inject(HttpTestingController);

    const all = client.listAll<{ n: number }>('Bin', { fields: ['n'] });
    const page = async (start: number, size: number) => {
      let request;
      await vi.waitFor(() => {
        request = http.match(
          (r) => r.params.get('limit_start') === (start ? String(start) : null),
        )[0];
        expect(request).toBeDefined();
      });
      request!.flush({ message: Array.from({ length: size }, (_, i) => ({ n: start + i })) });
    };
    await page(0, 500);
    await page(500, 3);

    expect((await all).length).toBe(503);
    http.verify();
  });

  it('defaults list queries to a bounded page and passes group_by through', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const client = TestBed.inject(ErpnextClient);
    const http = TestBed.inject(HttpTestingController);

    client.list('Sales Invoice', { fields: ['name'], groupBy: 'currency' }).subscribe();

    const request = http.expectOne((r) => r.url.endsWith('frappe.client.get_list'));
    expect(request.request.params.get('limit_page_length')).toBe('20');
    expect(request.request.params.get('group_by')).toBe('currency');
  });

  it('pages listAll on a unique sort so rows cannot repeat or go missing', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const client = TestBed.inject(ErpnextClient);
    const http = TestBed.inject(HttpTestingController);

    const all = client.listAll('Item Reorder', { fields: ['parent'] });
    let request: TestRequest | undefined;
    await vi.waitFor(() => {
      request ??= http.match(() => true)[0];
      expect(request).toBeDefined();
    });
    expect(request!.request.params.get('order_by')).toBe('name asc');
    request!.flush({ message: [] });
    await all;
  });
});
