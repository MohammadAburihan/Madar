import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { realTranslator, translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { ContactBankApiService } from '../data-access/contact-bank-api.service';
import { ContactFormApiService } from '../data-access/contact-form-api.service';
import { ContactsApiService } from '../data-access/contacts-api.service';
import { ContactContainer } from './contact.container';
import { ContactFormContainer } from './contact-form.container';

const plain = (el: Element | null | undefined) =>
  el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function configure(extra: Record<string, unknown>[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      {
        provide: ContactBankApiService,
        useValue: {
          banks: vi.fn().mockResolvedValue([]),
          account: vi.fn().mockResolvedValue(null),
          save: vi.fn(),
        },
      },
      {
        provide: SessionService,
        useValue: {
          user: signal({ id: 'rehan@rehan.example' }),
          persona: () => 'owner',
          capabilities: () => capabilitiesFor('owner'),
          checkExpired: vi.fn(),
        },
      },
      {
        provide: BusinessService,
        useValue: {
          active: signal({ name: 'Rehan Nursery', currency: 'ILS' }),
          ensure: () => Promise.resolve({ country: 'Palestine', currency: 'ILS' }),
        },
      },
      { provide: ViewportService, useValue: { viewport: signal('mobile') } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap({}) },
          queryParamMap: new BehaviorSubject(convertToParamMap({})),
        },
      },
      ...extra,
    ],
  });
}

async function form(edit: boolean, load: () => Promise<unknown>) {
  const api = {
    save: vi.fn().mockResolvedValue('Nour'),
    load: vi.fn(load),
    find: vi.fn(),
  };
  configure([{ provide: ContactFormApiService, useValue: api }]);
  const fixture = TestBed.createComponent(ContactFormContainer);
  if (edit) {
    fixture.componentRef.setInput('kind', 'suppliers');
    fixture.componentRef.setInput('id', 'Green Clay');
  }
  await fixture.whenStable();
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement, api };
}

const area = (root: HTMLElement) =>
  root.querySelector('app-text-area-field textarea') as HTMLTextAreaElement;
async function type(
  fixture: { whenStable(): Promise<unknown> },
  el: HTMLTextAreaElement,
  v: string,
) {
  el.value = v;
  el.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}
const save = (root: HTMLElement) =>
  [...root.querySelectorAll('button')].find((b) => /Save contact/.test(plain(b)))!;

describe('Contact About on the form', () => {
  it('shows an optional About field with its hint, and sends what is typed', async () => {
    const { fixture, root, api } = await form(false, () => Promise.resolve(null));
    expect(plain(root.querySelector('app-text-area-field'))).toContain('About (optional)');
    expect(plain(root.querySelector('app-text-area-field'))).toContain(
      'What they supply, or who they are',
    );
    const name = root.querySelector('app-text-field input') as HTMLInputElement;
    name.value = 'Nour';
    name.dispatchEvent(new Event('input'));
    await type(fixture, area(root), 'Sells clay pots');
    save(root).click();
    await fixture.whenStable();
    expect(api.save.mock.calls[0][1]).toMatchObject({ name: 'Nour', about: 'Sells clay pots' });
  });

  it('loads the existing text and saves an emptied field as empty', async () => {
    const { fixture, root, api } = await form(true, () =>
      Promise.resolve({ name: 'Green Clay', phone: '', email: '', address: '', about: 'Pots' }),
    );
    expect(area(root).value).toBe('Pots');
    await type(fixture, area(root), '');
    save(root).click();
    await fixture.whenStable();
    expect(api.save.mock.calls[0][1]).toMatchObject({ about: '' });
  });

  it('shows the load error and no editable form when the record fails to load', async () => {
    const { root, api } = await form(true, () => Promise.reject(new Error('down')));
    expect(root.querySelector('app-text-area-field')).toBeNull();
    expect(plain(root)).toContain('Try again');
    expect(api.save).not.toHaveBeenCalled();
  });

  it('has Arabic wording for the field, its hint and the page block', () => {
    const ar = realTranslator('ar');
    expect(ar.t('contacts.form.about')).toBe('نبذة (اختياري)');
    expect(ar.t('contacts.form.aboutHint')).not.toBe('contacts.form.aboutHint');
    expect(ar.t('contacts.about.title')).toBe('نبذة');
  });
});

describe('Contact About on the page', () => {
  const detail = (about: string | null) => ({
    id: 'Nour',
    name: 'Nour',
    phone: null,
    email: null,
    address: [],
    active: true,
    about,
    totals: null,
    latest: null,
    recent: [],
  });

  async function page(about: string | null) {
    configure([
      {
        provide: ContactsApiService,
        useValue: { customer: vi.fn().mockResolvedValue(detail(about)) },
      },
    ]);
    const fixture = TestBed.createComponent(ContactContainer);
    fixture.componentRef.setInput('kind', 'customers');
    fixture.componentRef.setInput('id', 'Nour');
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows the About block when set', async () => {
    const { root } = await page('Landscaper\nin Ramallah');
    const card = root.querySelector('app-about-card');
    expect(plain(card)).toBe('AboutLandscaper in Ramallah');
    expect(card?.querySelector('.text')?.textContent).toBe('Landscaper\nin Ramallah');
  });

  it('shows no block when it is empty', async () => {
    const { root } = await page(null);
    expect(root.querySelector('app-about-card')).toBeNull();
  });
});
