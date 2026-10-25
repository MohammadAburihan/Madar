import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { TaskPrefillService } from '../../../core/tasks/task-prefill.service';
import { SPEECH_OUTPUT } from '../../../core/speech/speech.tokens';
import { SpeechInputProblem, SpeechLanguage } from '../../../core/speech/speech.models';
import { Viewport, ViewportService } from '../../../core/layout/viewport.service';
import { AssistantState, AssistantStore } from '../data-access/assistant.store';
import {
  ApiMessage,
  ChoiceOption,
  ProblemKind,
  Proposal,
  RecordLink,
} from '../data-access/assistant.models';
import { AssistantContainer } from './assistant.container';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const plain = (el: Element | null | undefined) =>
  el?.textContent
    ?.replace(/[\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function setup(viewport: Viewport = 'mobile') {
  const store = {
    messages: signal<ApiMessage[]>([]),
    links: signal<Record<number, readonly RecordLink[]>>({}),
    proposals: signal<Record<number, readonly Proposal[]>>({}),
    choices: signal<Record<number, readonly ChoiceOption[]>>({}),
    proposal: vi.fn((id: string) =>
      Object.values(store.proposals())
        .flat()
        .find((p) => p.id === id),
    ),
    streaming: signal(''),
    state: signal<AssistantState>('idle'),
    activeTools: signal<string[]>([]),
    problem: signal<ProblemKind | null>(null),
    voiceSupported: signal(true),
    listening: signal(false),
    voiceProblem: signal<SpeechInputProblem | null>(null),
    send: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    clear: vi.fn(),
    listen: vi.fn().mockResolvedValue(undefined),
    stopListening: vi.fn(),
    cancelListening: vi.fn(),
  };
  const output = {
    languages: signal<readonly SpeechLanguage[]>(['en', 'ar']),
    speak: vi.fn(),
    stop: vi.fn(),
  };
  const prefills = { put: vi.fn().mockReturnValue('PF-1') };
  const user = signal<{ id: string } | null>({ id: 'lina@rehan.example' });
  const business = signal<{ name: string; currency?: string } | null>({
    name: 'Rehan Nursery',
    currency: 'ILS',
  });
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: SessionService, useValue: { user } },
      { provide: BusinessService, useValue: { active: business } },
      { provide: TaskPrefillService, useValue: prefills },
      provideRouter([]),
      { provide: AssistantStore, useValue: store },
      { provide: SPEECH_OUTPUT, useValue: output },
      { provide: ViewportService, useValue: { viewport: signal(viewport) } },
    ],
  });
  const fixture = TestBed.createComponent(AssistantContainer);
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    root,
    store,
    output,
    user,
    business,
    prefills,
    router: TestBed.inject(Router),
  };
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
      'Lina Haddad is a customer. Read aloud',
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

  describe('proposals', () => {
    const SALE: Proposal = {
      id: 'PRP-1',
      kind: 'quick_sale',
      party: 'Lina Haddad',
      item: null,
      lines: [{ name: 'Olive tree', qty: 2, amount: 170 }],
      total: 170,
      amount: null,
      due: null,
      from: null,
      to: null,
      record: null,
      request: {
        kind: 'quick_sale',
        payload: { customer: 'Lina Haddad', lines: [{ item_code: 'OLV-20', qty: 2 }] },
      },
    };
    const RECORD: Proposal = {
      ...SALE,
      id: 'PRP-2',
      kind: 'open_record',
      party: 'SI-1',
      lines: [],
      total: null,
      record: { kind: 'invoice', id: 'SI-1', label: 'SI-1', draft: true },
      request: null,
    };
    const conversation = (store: ReturnType<typeof setup>['store'], proposals: Proposal[]) => {
      store.messages.set([
        { role: 'user', content: 'Sell 2 olive trees to Lina' },
        { role: 'assistant', content: [{ type: 'text', text: 'Please review it.' }] },
      ]);
      store.proposals.set({ 1: proposals });
    };

    it('shows the card under the reply with what is proposed and that nothing is saved yet', async () => {
      const { fixture, root, store } = setup();
      conversation(store, [SALE]);
      await fixture.whenStable();
      const card = root.querySelector('app-assistant-proposal')!;
      expect(plain(card)).toContain('Sale to Lina Haddad');
      expect(plain(card)).toContain('2 × Olive tree — ILS 170.00');
      expect(plain(card)).toContain('Total ILS 170.00');
      expect(plain(card)).toContain('Nothing is saved until you confirm.');
      expect(text(card.querySelector('button'))).toBe('Review sale');
    });

    it('hands the proposal over once and opens the task with its id', async () => {
      const { fixture, root, store, router, prefills } = setup();
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      conversation(store, [SALE]);
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('app-assistant-proposal button')!.click();
      expect(prefills.put).toHaveBeenCalledWith(SALE.request);
      expect(navigate).toHaveBeenCalledWith(['/sales/new', 'basket'], {
        queryParams: { prefill: 'PF-1' },
      });
    });

    it('opens a record straight to its page, with nothing handed over', async () => {
      const { fixture, root, store, router, prefills } = setup();
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      conversation(store, [RECORD]);
      await fixture.whenStable();
      const card = root.querySelector('app-assistant-proposal')!;
      expect(plain(card)).toContain('Draft SI-1');
      expect(plain(card)).not.toContain('Nothing is saved');
      card.querySelector('button')!.click();
      expect(prefills.put).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/sales/invoices', 'SI-1'], {
        queryParams: undefined,
      });
    });

    it('goes nowhere when nobody is signed in to hand the proposal to', async () => {
      const { fixture, root, store, router, prefills } = setup();
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      prefills.put.mockReturnValue(null);
      conversation(store, [SALE]);
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('app-assistant-proposal button')!.click();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('offers the matches as buttons that send the chosen label as the next message', async () => {
      const { fixture, root, store } = setup();
      store.messages.set([
        { role: 'user', content: 'Sell 2 olive trees to Lina' },
        { role: 'assistant', content: [{ type: 'text', text: 'Which Lina?' }] },
      ]);
      store.choices.set({
        1: [
          { id: 'C-1', label: 'Lina Haddad' },
          { id: 'C-2', label: 'Lina Khoury' },
        ],
      });
      await fixture.whenStable();
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('app-assistant-choices button')];
      expect(buttons.map(text)).toEqual(['Lina Haddad', 'Lina Khoury']);
      buttons[1].click();
      expect(store.send).toHaveBeenCalledWith('Lina Khoury');
    });
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

  describe('voice', () => {
    const answered = (store: ReturnType<typeof setup>['store']) =>
      store.messages.set([
        { role: 'user', content: 'Who is Lina?' },
        { role: 'assistant', content: [{ type: 'text', text: 'Lina is **a customer**.' }] },
      ]);

    it('leaves listening when the page is left or destroyed', async () => {
      const { fixture, store, output } = setup();
      await fixture.whenStable();
      fixture.componentInstance.ionViewWillLeave();
      expect(store.cancelListening).toHaveBeenCalledTimes(1);
      expect(output.stop).toHaveBeenCalled();
      fixture.destroy();
      expect(store.cancelListening).toHaveBeenCalledTimes(2);
    });

    it('starts listening on the microphone, adds what is heard to what was typed, and never sends', async () => {
      const { fixture, root, store } = setup();
      await fixture.whenStable();
      const field = root.querySelector('textarea')!;
      field.value = 'Who owes';
      field.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('button.mic')!.click();
      const onText = store.listen.mock.calls[0][0] as (text: string) => void;
      onText('money today');
      await fixture.whenStable();
      expect(field.value).toBe('Who owes money today');
      expect(store.send).not.toHaveBeenCalled();
    });

    it('stops listening on a second press, and has no microphone without recognition', async () => {
      const { fixture, root, store } = setup();
      store.listening.set(true);
      await fixture.whenStable();
      expect(root.querySelector('.listening')).not.toBeNull();
      root.querySelector<HTMLButtonElement>('button.mic')!.click();
      expect(store.stopListening).toHaveBeenCalled();
      expect(store.listen).not.toHaveBeenCalled();
      store.voiceSupported.set(false);
      await fixture.whenStable();
      expect(root.querySelector('button.mic')).toBeNull();
    });

    it('shows the notice for a microphone that is off', async () => {
      const { fixture, root, store } = setup();
      store.voiceProblem.set('denied');
      await fixture.whenStable();
      expect(text(root.querySelector('app-feedback-card'))).toContain('Microphone access is off');
    });

    it('reads a reply aloud as plain text, and stops on a second press', async () => {
      const { fixture, root, store, output } = setup();
      answered(store);
      await fixture.whenStable();
      const read = () => root.querySelector<HTMLButtonElement>('button.read')!;
      read().click();
      expect(output.speak).toHaveBeenCalledWith('Lina is a customer.', 'en', expect.any(Function));
      await fixture.whenStable();
      expect(read().getAttribute('aria-pressed')).toBe('true');
      read().click();
      expect(output.stop).toHaveBeenCalled();
      await fixture.whenStable();
      expect(read().getAttribute('aria-pressed')).toBe('false');
    });

    it('returns to idle when the reading ends, and has no button without a voice', async () => {
      const { fixture, root, store, output } = setup();
      answered(store);
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('button.read')!.click();
      (output.speak.mock.calls[0][2] as () => void)();
      await fixture.whenStable();
      expect(root.querySelector('button.read')!.getAttribute('aria-pressed')).toBe('false');
      output.languages.set([]);
      await fixture.whenStable();
      expect(root.querySelector('button.read')).toBeNull();
    });
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
