import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from './erpnext-client';

describe('ErpnextClient', () => {
  it('stops listAll at maxRows without reading further pages', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const client = TestBed.inject(ErpnextClient);
    const http = TestBed.inject(HttpTestingController);
    const all = client.listAll<{ n: number }>('Bin', { fields: ['n'] }, 600);
    const read = async (start: number, size: number) => {
      await vi.waitFor(() => {
        const request = http.match(
          (r) => r.params.get('limit_start') === (start ? String(start) : null),
        )[0];
        expect(request).toBeDefined();
        request.flush({ message: Array.from({ length: size }, (_, i) => ({ n: start + i })) });
      });
    };
    await read(0, 500);
    await read(500, 500);
    expect(await all).toHaveLength(600);
    http.verify();
  });

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

  it('uploads a file as a private attachment of the document', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const client = TestBed.inject(ErpnextClient);
    const http = TestBed.inject(HttpTestingController);

    const done = firstValueFrom(
      client.upload(new Blob(['x']), 'receipt.jpg', { doctype: 'Journal Entry', name: 'JV-1' }),
    );
    const request = http.expectOne((r) => r.url.endsWith('/api/method/upload_file'));
    const form = request.request.body as FormData;
    expect([form.get('doctype'), form.get('docname'), form.get('is_private')]).toEqual([
      'Journal Entry',
      'JV-1',
      '1',
    ]);
    expect((form.get('file') as File).name).toBe('receipt.jpg');
    request.flush({ message: { name: 'FILE-1', file_url: '/private/files/receipt.jpg' } });
    expect((await done).name).toBe('FILE-1');
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
