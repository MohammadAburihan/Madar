import { Injectable, inject } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { NATIVE_PLATFORM } from './native-platform';

/** Hands a generated file (a statement PDF) to the user: the share sheet, or saved to the device. */
@Injectable({ providedIn: 'root' })
export class FileExportService {
  private readonly platform = inject(NATIVE_PLATFORM);

  /** The device's share sheet; in a browser without one for files, a download. */
  async share(file: File): Promise<void> {
    if (this.platform !== 'web') {
      await this.shareNative(file);
      return;
    }
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
      } catch (error) {
        // The tap's permission may have lapsed while the file was made; download instead. Cancelling is silent.
        if ((error as Error)?.name !== 'AbortError') {
          download(file);
        }
      }
      return;
    }
    download(file);
  }

  /** A download in the browser; in the apps, the share sheet, whose "Save to Files" keeps a copy on the device. */
  async save(file: File): Promise<void> {
    if (this.platform !== 'web') {
      await this.shareNative(file);
      return;
    }
    download(file);
  }

  private async shareNative(file: File): Promise<void> {
    const { uri } = await Filesystem.writeFile({
      path: file.name,
      data: await base64(file),
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: file.name, files: [uri] });
    } catch (error) {
      // Closing the sheet rejects with "Share canceled"; that is the user's choice, not a failure.
      if (!/cancel/i.test((error as Error)?.message ?? '')) {
        throw error;
      }
    }
  }
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function base64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
