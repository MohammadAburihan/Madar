import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { PrefillRequest, TaskPrefillService } from '../../../core/tasks/task-prefill.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { ItemsApiService } from '../data-access/items-api.service';
import { ItemFormContainer } from './item-form.container';

const plain = (el: Element | null | undefined) =>
  el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const field = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('app-text-field')]
    .find((el) => plain(el.querySelector('.label')).startsWith(label))
    ?.querySelector('input') as HTMLInputElement | undefined;

interface Options {
  persona?: Persona;
  roles?: string[];
  held?: PrefillRequest;
  missing?: string;
  otherUser?: boolean;
  optionsFail?: boolean;
}

async function open({ persona = 'owner', roles, held, missing, otherUser, optionsFail }: Options) {
  TestBed.resetTestingModule();
  const query = new BehaviorSubject(convertToParamMap({}));
  const user = signal<{ id: string } | null>({ id: 'rehan@rehan.example' });
  const api = {
    options: vi.fn(() =>
      optionsFail
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ groups: ['Plants'], uoms: ['Unit'] }),
    ),
    detail: vi.fn(),
    create: vi.fn().mockResolvedValue('FIG-1'),
  };
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: ItemsApiService, useValue: api },
      {
        provide: SessionService,
        useValue: {
          user,
          capabilities: () => capabilitiesFor(persona, roles),
          checkExpired: vi.fn(),
        },
      },
      {
        provide: BusinessService,
        useValue: {
          active: signal({ name: 'Rehan Nursery', currency: 'ILS' }),
          ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }),
        },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: () => Promise.resolve(), now: () => new Date(2026, 9, 25) },
      },
      { provide: ViewportService, useValue: { viewport: signal('mobile') } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            get queryParamMap() {
              return query.value;
            },
          },
          queryParamMap: query,
        },
      },
    ],
  });
  const prefills = TestBed.inject(TaskPrefillService);
  TestBed.tick();
  const id = held ? prefills.put(held) : (missing ?? null);
  if (otherUser) {
    user.set({ id: 'someone@else.example' });
  }
  query.next(convertToParamMap(id ? { prefill: id } : {}));
  const fixture = TestBed.createComponent(ItemFormContainer);
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, prefills, id, api };
}

describe('ItemFormContainer with an assistant proposal', () => {
  it('fills the name, the kind and the owner’s selling price in, and says the assistant did', async () => {
    const { root, prefills, id } = await open({
      held: { kind: 'new_item', payload: { name: 'Fig tree', kind: 'service', price: 45 } },
    });
    expect(field(root, 'Service name')?.value).toBe('Fig tree');
    expect(field(root, 'Selling price')?.value).toBe('45');
    const notice = plain(root.querySelector('app-feedback-card'));
    expect(notice).toContain('Filled in by the assistant');
    expect(notice).toContain('Check the details, then save.');
    expect(prefills.peek('new_item', id!)).toBeNull();
  });

  it('opens a product with its name and no price when none was given', async () => {
    const { root } = await open({
      held: { kind: 'new_item', payload: { name: 'Fig tree', kind: 'product' } },
    });
    expect(field(root, 'Name')?.value).toBe('Fig tree');
    expect(field(root, 'Selling price')?.value).toBe('');
  });

  it('shows no price field for a role that may not set prices, even if one came along', async () => {
    const { root } = await open({
      persona: 'purchasing',
      roles: ['Purchase User', 'Stock User', 'Accounts User', 'Item Manager'],
      held: { kind: 'new_item', payload: { name: 'Fig tree', kind: 'product', price: 45 } },
    });
    expect(field(root, 'Name')?.value).toBe('Fig tree');
    expect(field(root, 'Selling price')).toBeUndefined();
    expect(plain(root.querySelector('app-feedback-card'))).toContain('Filled in by the assistant');
  });

  it('shows the expired notice and an empty form for an id nothing holds', async () => {
    const { root } = await open({ missing: 'PF-GONE' });
    expect(plain(root.querySelector('app-feedback-card'))).toContain('This proposal has expired.');
    expect(field(root, 'Name')?.value).toBe('');
  });

  it('shows the expired notice when another user is signed in', async () => {
    const { root } = await open({
      held: { kind: 'new_item', payload: { name: 'Fig tree', kind: 'product' } },
      otherUser: true,
    });
    expect(plain(root.querySelector('app-feedback-card'))).toContain('This proposal has expired.');
    expect(field(root, 'Name')?.value).toBe('');
  });

  it('does not apply the proposal on a retry after the options failed to load', async () => {
    const { fixture, root, api } = await open({
      held: { kind: 'new_item', payload: { name: 'Fig tree', kind: 'product' } },
      optionsFail: true,
    });
    expect(field(root, 'Name')).toBeUndefined();
    api.options.mockResolvedValue({ groups: ['Plants'], uoms: ['Unit'] });
    await (fixture.componentInstance as unknown as { loadForm(): Promise<void> }).loadForm();
    fixture.detectChanges();
    expect(field(fixture.nativeElement, 'Name')?.value).toBe('');
  });

  it('saves nothing until the user saves', async () => {
    const { api } = await open({
      held: { kind: 'new_item', payload: { name: 'Fig tree', kind: 'product' } },
    });
    expect(api.create).not.toHaveBeenCalled();
  });
});
