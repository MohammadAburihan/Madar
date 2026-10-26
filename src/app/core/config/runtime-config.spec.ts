import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NATIVE_ERPNEXT_URLS, NATIVE_PLATFORM, NativePlatform } from '../platform/native-platform';
import { RuntimeConfigService, normalizeUrl } from './runtime-config';

function setup(
  platform: NativePlatform,
  nativeUrls: Record<string, string> = { android: '', ios: '' },
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NATIVE_PLATFORM, useValue: platform },
      { provide: NATIVE_ERPNEXT_URLS, useValue: nativeUrls },
    ],
  });
  return {
    service: TestBed.inject(RuntimeConfigService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('RuntimeConfigService', () => {
  // A connection another spec stored would win over the platform default.
  beforeEach(() => localStorage.clear());

  it('uses the loaded URL without a trailing slash', async () => {
    const { service, http } = setup('web');
    const loading = service.load();
    http.expectOne('config.json').flush({ erpnextUrl: 'https://erp.example.com/' });
    await loading;

    expect(service.erpnextUrl()).toBe('https://erp.example.com');
  });

  it('stays same-origin on the web when config.json is empty', async () => {
    const { service, http } = setup('web', { android: 'http://10.0.2.2:8080', ios: '' });
    const loading = service.load();
    http.expectOne('config.json').flush({ erpnextUrl: '' });
    await loading;

    expect(service.erpnextUrl()).toBe('');
  });

  it('falls back to the platform default in native apps', async () => {
    const { service, http } = setup('android', { android: 'http://10.0.2.2:8080', ios: '' });
    const loading = service.load();
    http.expectOne('config.json').flush({ erpnextUrl: '' });
    await loading;

    expect(service.erpnextUrl()).toBe('http://10.0.2.2:8080');
  });

  it('normalizes configured URLs and rejects garbage', () => {
    expect(normalizeUrl('erp.example.com')).toBe('https://erp.example.com');
    expect(normalizeUrl(' http://10.0.2.2:8081/ ')).toBe('http://10.0.2.2:8081');
    expect(normalizeUrl('https://erp.example.com/base/')).toBe('https://erp.example.com/base');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(normalizeUrl('http://')).toBe('');
    expect(normalizeUrl('')).toBe('');
  });

  it('ignores a non-string erpnextUrl instead of crashing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { service, http } = setup('web');
    const loading = service.load();
    http.expectOne('config.json').flush({ erpnextUrl: 8080 });
    await loading;

    expect(service.erpnextUrl()).toBe('');
  });

  describe('deskUrl', () => {
    it('reads a valid Desk address on the web', async () => {
      const { service, http } = setup('web');
      const loading = service.load();
      http.expectOne('config.json').flush({ erpnextUrl: '', deskUrl: 'https://desk.example.com/' });
      await loading;

      expect(service.deskUrl()).toBe('https://desk.example.com');
    });

    it('is empty when missing or blank', async () => {
      const { service, http } = setup('web');
      const loading = service.load();
      http.expectOne('config.json').flush({ erpnextUrl: '', deskUrl: '' });
      await loading;

      expect(service.deskUrl()).toBe('');
    });

    it('ignores an address that is not http(s), with a warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      for (const bad of ['javascript:alert(1)', 'desk.example.com', 8080]) {
        TestBed.resetTestingModule();
        const { service, http } = setup('web');
        const loading = service.load();
        http.expectOne('config.json').flush({ erpnextUrl: '', deskUrl: bad });
        await loading;

        expect(service.deskUrl()).toBe('');
      }
      expect(warn).toHaveBeenCalledTimes(3);
    });

    it('is taken from the connected business in native apps, not from the bundled config', async () => {
      localStorage.setItem('madar.connection', 'https://rehan.example.com');
      const { service, http } = setup('android');
      const loading = service.load();
      http
        .expectOne('config.json')
        .flush({ erpnextUrl: '', deskUrl: 'https://bundled.example.com' });
      await loading;
      expect(service.deskUrl()).toBe('');

      http.expectOne('https://rehan.example.com/config.json').flush({
        erpnextUrl: 'https://other.example.com',
        deskUrl: 'https://desk.rehan.example.com',
      });
      await vi.waitFor(() => expect(service.deskUrl()).toBe('https://desk.rehan.example.com'));
      expect(service.erpnextUrl()).toBe('https://rehan.example.com');
    });

    it('stays hidden when the connected business config cannot be read', async () => {
      localStorage.setItem('madar.connection', 'https://rehan.example.com');
      const { service, http } = setup('ios');
      const fetching = service.loadNativeDesk();
      http
        .expectOne('https://rehan.example.com/config.json')
        .flush('nope', { status: 500, statusText: 'Server Error' });
      await fetching;

      expect(service.deskUrl()).toBe('');
    });

    it('does not fetch in native apps without a connection', async () => {
      const { service, http } = setup('android');
      await service.loadNativeDesk();

      http.expectNone(() => true);
      expect(service.deskUrl()).toBe('');
    });
  });
});
