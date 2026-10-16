import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

const writeFile = vi.fn().mockResolvedValue({ uri: 'file:///cache/statement.pdf' });
const share = vi.fn().mockResolvedValue({});
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: (...args: unknown[]) => writeFile(...args) },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: (...args: unknown[]) => share(...args) } }));

import { FileExportService } from './file-export.service';
import { NATIVE_PLATFORM } from './native-platform';

const pdf = () => new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' });
const service = (platform: 'web' | 'android' | 'ios') => {
  TestBed.configureTestingModule({ providers: [{ provide: NATIVE_PLATFORM, useValue: platform }] });
  return TestBed.inject(FileExportService);
};

describe('FileExportService', () => {
  beforeEach(() => {
    writeFile.mockClear();
    share.mockClear();
  });

  it('in the apps, writes the file to the cache and opens the share sheet, for share and save alike', async () => {
    const files = service('android');
    await files.share(pdf());
    await files.save(pdf());
    expect(writeFile).toHaveBeenCalledWith({
      path: 'statement.pdf',
      data: btoa('%PDF'),
      directory: 'CACHE',
    });
    expect(share).toHaveBeenCalledWith({
      title: 'statement.pdf',
      files: ['file:///cache/statement.pdf'],
    });
    expect(share).toHaveBeenCalledTimes(2);
  });

  it('treats closing the share sheet as a choice, and other failures as failures', async () => {
    const files = service('ios');
    share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(files.share(pdf())).resolves.toBeUndefined();
    share.mockRejectedValueOnce(new Error('No activity found'));
    await expect(files.share(pdf())).rejects.toThrow('No activity found');
  });

  it('downloads in a browser that has no share sheet for files', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    Object.assign(navigator, { canShare: undefined });
    await service('web').share(pdf());
    expect(click).toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    click.mockRestore();
  });
});
