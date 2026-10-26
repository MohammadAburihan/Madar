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
import { ContactFormApiService } from '../data-access/contact-form-api.service';
import { ContactFormContainer } from './contact-form.container';

const plain = (el: Element | null | undefined) =>
  el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const input = (root: HTMLElement, index: number) =>
  root.querySelectorAll('app-text-field input')[index] as HTMLInputElement;

interface Options {
  persona?: Persona;
  held?: PrefillRequest;
  /** An id the address names that nothing holds. */
  missing?: string;
  otherUser?: boolean;
}

async function open({ persona = 'owner', held, missing, otherUser }: Options) {
  TestBed.resetTestingModule();
  const query = new BehaviorSubject(convertToParamMap({}));
  const user = signal<{ id: string } | null>({ id: 'rehan@rehan.example' });
  const save = vi.fn().mockResolvedValue('C-1');
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: ContactFormApiService, useValue: { save, load: vi.fn(), find: vi.fn() } },
      {
        provide: SessionService,
        useValue: { user, capabilities: () => capabilitiesFor(persona), checkExpired: vi.fn() },
      },
      {
        provide: BusinessService,
        useValue: {
          active: signal({ name: 'Rehan Nursery' }),
          ensure: () => Promise.resolve({ country: 'Palestine' }),
        },
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
  const fixture = TestBed.createComponent(ContactFormContainer);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, prefills, id, save };
}

describe('ContactFormContainer with an assistant proposal', () => {
  it('fills a new customer in and says the assistant did', async () => {
    const { root, prefills, id } = await open({
      held: {
        kind: 'new_customer',
        payload: {
          name: 'Samer Odeh',
          phone: '0599 123 456',
          email: 'samer@example.com',
          address: 'Nablus',
        },
      },
    });
    expect(input(root, 0).value).toBe('Samer Odeh');
    expect(input(root, 1).value).toBe('0599 123 456');
    expect(input(root, 2).value).toBe('samer@example.com');
    expect(input(root, 3).value).toBe('Nablus');
    const notice = plain(root.querySelector('app-feedback-card'));
    expect(notice).toContain('Filled in by the assistant');
    expect(notice).toContain('Check the details, then save.');
    expect(prefills.peek('new_customer', id!)).toBeNull();
  });

  it('opens a new supplier as a supplier, with no address', async () => {
    const { root, fixture } = await open({
      persona: 'purchasing',
      held: { kind: 'new_supplier', payload: { name: 'Clay Works', phone: '02 555 1234' } },
    });
    expect(input(root, 0).value).toBe('Clay Works');
    expect(input(root, 1).value).toBe('02 555 1234');
    expect(input(root, 3).value).toBe('');
    expect(plain(root.querySelector('app-feedback-card'))).toContain('Filled in by the assistant');
    expect(fixture.componentInstance['contactKind']()).toBe('suppliers');
  });

  it('keeps the supplier kind for an owner, who may add either', async () => {
    const { fixture } = await open({
      held: { kind: 'new_supplier', payload: { name: 'Clay Works' } },
    });
    expect(fixture.componentInstance['contactKind']()).toBe('suppliers');
  });

  it('shows the expired notice and an empty form for an id nothing holds', async () => {
    const { root } = await open({ missing: 'PF-GONE' });
    expect(plain(root.querySelector('app-feedback-card'))).toContain('This proposal has expired.');
    expect(input(root, 0).value).toBe('');
  });

  it('shows the expired notice when another user is signed in', async () => {
    const { root } = await open({
      held: { kind: 'new_customer', payload: { name: 'Samer Odeh' } },
      otherUser: true,
    });
    expect(plain(root.querySelector('app-feedback-card'))).toContain('This proposal has expired.');
    expect(input(root, 0).value).toBe('');
  });

  it('leaves the form empty with a notice when the role may not add that kind', async () => {
    const { root } = await open({
      persona: 'salesperson',
      held: { kind: 'new_supplier', payload: { name: 'Clay Works' } },
    });
    expect(plain(root.querySelector('app-feedback-card'))).toContain(
      "This proposal can't be opened.",
    );
    expect(input(root, 0).value).toBe('');
  });

  it('saves nothing until the user saves, then through the form’s own save', async () => {
    const { root, save } = await open({
      held: { kind: 'new_customer', payload: { name: 'Samer Odeh' } },
    });
    expect(save).not.toHaveBeenCalled();
    (root.querySelector('button.md-btn--primary') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe('customers');
    expect(save.mock.calls[0][1]).toMatchObject({ name: 'Samer Odeh' });
  });
});
