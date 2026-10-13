import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { NATIVE_PLATFORM, NativePlatform } from '../platform/native-platform';
import { RuntimeConfigService } from './runtime-config';

function setup(platform: NativePlatform) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NATIVE_PLATFORM, useValue: platform },
    ],
  });
  return {
    service: TestBed.inject(RuntimeConfigService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('RuntimeConfigService', () => {
  afterEach(() => {
    environment.nativeErpnextUrl = { android: '', ios: '' };
  });

  it('uses the loaded URL without a trailing slash', async () => {
    const { service, http } = setup('web');
    const loading = service.load();
    http.expectOne('config.json').flush({ erpnextUrl: 'https://erp.example.com/' });
    await loading;

    expect(service.erpnextUrl()).toBe('https://erp.example.com');
  });

  it('stays same-origin on the web when config.json is empty', async () => {
    environment.nativeErpnextUrl = { android: 'http://10.0.2.2:8080', ios: '' };
    const { service, http } = setup('web');
    const loading = service.load();
    http.expectOne('config.json').flush({ erpnextUrl: '' });
    await loading;

    expect(service.erpnextUrl()).toBe('');
  });

  it('falls back to the platform default in native apps', async () => {
    environment.nativeErpnextUrl = { android: 'http://10.0.2.2:8080', ios: '' };
    const { service, http } = setup('android');
    const loading = service.load();
    http.expectOne('config.json').flush({ erpnextUrl: '' });
    await loading;

    expect(service.erpnextUrl()).toBe('http://10.0.2.2:8080');
  });

  it('ignores a non-string erpnextUrl instead of crashing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { service, http } = setup('web');
    const loading = service.load();
    http.expectOne('config.json').flush({ erpnextUrl: 8080 });
    await loading;

    expect(service.erpnextUrl()).toBe('');
  });
});
