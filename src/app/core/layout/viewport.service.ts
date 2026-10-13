import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type Viewport = 'mobile' | 'tablet' | 'desktop';

const TABLET = '(min-width: 768px)';
const DESKTOP = '(min-width: 1280px)';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly current = signal<Viewport>(this.measure());

  readonly viewport = this.current.asReadonly();

  constructor() {
    for (const query of [TABLET, DESKTOP]) {
      this.window
        ?.matchMedia?.(query)
        .addEventListener('change', () => this.current.set(this.measure()));
    }
  }

  private measure(): Viewport {
    const matches = (query: string) => this.window?.matchMedia?.(query).matches ?? false;
    if (matches(DESKTOP)) {
      return 'desktop';
    }
    return matches(TABLET) ? 'tablet' : 'mobile';
  }
}
