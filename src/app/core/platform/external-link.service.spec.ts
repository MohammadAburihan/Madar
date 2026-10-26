import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

const openBrowser = vi.fn().mockResolvedValue(undefined);
vi.mock('@capacitor/browser', () => ({
  Browser: { open: (...args: unknown[]) => openBrowser(...args) },
}));

import { ExternalLinkService } from './external-link.service';
import { NATIVE_PLATFORM } from './native-platform';

const service = (platform: 'web' | 'android' | 'ios') => {
  TestBed.configureTestingModule({ providers: [{ provide: NATIVE_PLATFORM, useValue: platform }] });
  return TestBed.inject(ExternalLinkService);
};

describe('ExternalLinkService', () => {
  beforeEach(() => openBrowser.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('opens a new tab without an opener on the web', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await service('web').open('https://desk.example.com');

    expect(open).toHaveBeenCalledWith('https://desk.example.com', '_blank', 'noopener');
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('shows the address in the in-app browser in the apps', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    for (const platform of ['android', 'ios'] as const) {
      TestBed.resetTestingModule();
      await service(platform).open('https://desk.example.com');
    }

    expect(openBrowser).toHaveBeenCalledTimes(2);
    expect(openBrowser).toHaveBeenCalledWith({ url: 'https://desk.example.com' });
    expect(open).not.toHaveBeenCalled();
  });
});
