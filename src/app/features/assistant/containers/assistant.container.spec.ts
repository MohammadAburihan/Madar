import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { Viewport, ViewportService } from '../../../core/layout/viewport.service';
import { AssistantState, AssistantStore } from '../data-access/assistant.store';
import { ApiMessage, ProblemKind, RecordLink } from '../data-access/assistant.models';
import { AssistantContainer } from './assistant.container';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

function setup(viewport: Viewport = 'mobile') {
  const store = {
    messages: signal<ApiMessage[]>([]),
    links: signal<Record<number, readonly RecordLink[]>>({}),
    streaming: signal(''),
    state: signal<AssistantState>('idle'),
    activeTools: signal<string[]>([]),
    problem: signal<ProblemKind | null>(null),
    send: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    clear: vi.fn(),
  };
  const user = signal<{ id: string } | null>({ id: 'lina@rehan.example' });
  const business = signal<{ name: string } | null>({ name: 'Rehan Nursery' });
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: SessionService, useValue: { user } },
      { provide: BusinessService, useValue: { active: business } },
      provideRouter([]),
      { provide: AssistantStore, useValue: store },
      { provide: ViewportService, useValue: { viewport: signal(viewport) } },
    ],
  });
  const fixture = TestBed.createComponent(AssistantContainer);
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, store, user, business, router: TestBed.inject(Router) };
}

describe('AssistantContainer', () => {
  it('opens on the suggestions, with the title and the composer', async () => {
    const { fixture, root } = setup();
    await fixture.whenStable();
    expect(text(root.querySelector('h1'))).toBe('Assistant');
    expect([...root.querySelectorAll('app-assistant-suggestions button')].map(text)).toEqual([
      "Today's sales",
      'Who owes money?',
      'Low stock items',
    ]);
    expect(root.querySelector('app-assistant-conversation')).toBeNull();
    expect(root.querySelector('app-assistant-composer')).not.toBeNull();
    expect([...root.querySelectorAll('button')].map(text)).not.toContain('New chat');
  });

  it("sends a suggestion's text", async () => {
    const { fixture, root, store } = setup();
    await fixture.whenStable();
    root.querySelectorAll<HTMLButtonElement>('app-assistant-suggestions button')[1].click();
    expect(store.send).toHaveBeenCalledWith('Who owes money?');
  });

  it('sends what is typed, and empties the field', async () => {
    const { fixture, root, store } = setup();
    await fixture.whenStable();
    const field = root.querySelector('textarea')!;
    field.value = 'How much did we sell?';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('button.send')!.click();
    await fixture.whenStable();
    expect(store.send).toHaveBeenCalledWith('How much did we sell?');
    expect(field.value).toBe('');
  });

  it('shows the conversation, a New chat action that clears it, and the lookup under way', async () => {
    const { fixture, root, store } = setup();
    store.messages.set([
      { role: 'user', content: 'Who is Lina?' },
      { role: 'assistant', content: [{ type: 'text', text: 'Lina Haddad is a customer.' }] },
    ]);
    store.state.set('running-tool');
    store.activeTools.set(['search_customers']);
    await fixture.whenStable();
    expect(root.querySelector('app-assistant-suggestions')).toBeNull();
    expect([...root.querySelectorAll('app-assistant-message')].map(text)).toEqual([
      'Who is Lina?',
      'Lina Haddad is a customer.',
    ]);
    expect(text(root.querySelector('.activity'))).toBe('Looking up customers…');
    expect(root.querySelector('button.stop')).not.toBeNull();
    [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => text(b) === 'New chat')!
      .click();
    expect(store.clear).toHaveBeenCalled();
  });

  it('shows a problem under the conversation and stops on request', async () => {
    const { fixture, root, store } = setup();
    store.messages.set([{ role: 'user', content: 'Hi' }]);
    store.problem.set('busy');
    store.state.set('sending');
    await fixture.whenStable();
    expect(text(root.querySelector('app-feedback-card'))).toBe(
      'The assistant is busy. Try again in a moment.',
    );
    root.querySelector<HTMLButtonElement>('button.stop')!.click();
    expect(store.stop).toHaveBeenCalled();
  });

  it('opens the record a reply names, and keeps the New chat action in the desktop heading', async () => {
    const { fixture, root, store, router } = setup('desktop');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.messages.set([
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: [{ type: 'text', text: 'See SI-1042.' }] },
    ]);
    store.links.set({
      1: [{ kind: 'invoice', id: 'SI-1042', label: 'SI-1042', mentions: ['SI-1042'] }],
    });
    await fixture.whenStable();
    expect(root.querySelector('app-page-heading button')).not.toBeNull();
    [...root.querySelectorAll<HTMLButtonElement>('app-assistant-message button')]
      .find((b) => text(b)?.includes('SI-1042'))!
      .click();
    expect(navigate).toHaveBeenCalledWith(['/sales/invoices', 'SI-1042']);
  });

  it('stops the answer when the user leaves the page', async () => {
    const { fixture, store } = setup();
    await fixture.whenStable();
    fixture.destroy();
    expect(store.stop).toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });

  describe('the unsent text', () => {
    async function typed() {
      const ctx = setup();
      await ctx.fixture.whenStable();
      const field = ctx.root.querySelector('textarea')!;
      const type = async (value: string) => {
        field.value = value;
        field.dispatchEvent(new Event('input'));
        await ctx.fixture.whenStable();
      };
      await type('Half a question');
      return { ...ctx, field };
    }

    it('is kept while the same user and business stay', async () => {
      const { fixture, field, business } = await typed();
      business.set({ name: 'Rehan Nursery' });
      await fixture.whenStable();
      expect(field.value).toBe('Half a question');
    });

    it('is emptied for another user or on sign-out', async () => {
      const { fixture, field, user } = await typed();
      user.set({ id: 'sam@rehan.example' });
      await fixture.whenStable();
      expect(field.value).toBe('');
      field.value = 'Again';
      field.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      user.set(null);
      await fixture.whenStable();
      expect(field.value).toBe('');
    });

    it('is emptied when the active business changes, not on its first load', async () => {
      const { fixture, field, business } = await typed();
      business.set({ name: 'Other Co' });
      await fixture.whenStable();
      expect(field.value).toBe('');
    });

    it('is emptied on entering the page only when the user changed since the last visit', async () => {
      const { fixture, field, user } = await typed();
      fixture.componentInstance.ionViewWillEnter();
      await fixture.whenStable();
      expect(field.value).toBe('Half a question');
      user.set({ id: 'sam@rehan.example' });
      field.value = 'Sam typed';
      field.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.componentInstance.ionViewWillEnter();
      await fixture.whenStable();
      expect(field.value).toBe('');
    });
  });
});
