import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConversationItemView } from '../containers/assistant-view';
import { AssistantComposerComponent } from './assistant-composer.component';
import { AssistantConversationComponent } from './assistant-conversation.component';
import { AssistantMessageComponent } from './assistant-message.component';
import { AssistantSuggestionsComponent } from './assistant-suggestions.component';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const el = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;

const REPLY: ConversationItemView = {
  id: 'm1',
  role: 'assistant',
  author: 'Assistant',
  blocks: [
    {
      kind: 'paragraph',
      segments: [
        { text: 'Lina owes ', bold: false },
        { text: 'ILS 250.00', bold: true },
        { text: ' on SI-1042.', bold: false },
      ],
    },
    {
      kind: 'list',
      items: [
        [{ text: 'POT-30: 2', bold: false }],
        [
          { text: 'Seed mix: ', bold: false },
          { text: '0', bold: true },
        ],
      ],
    },
  ],
  links: [
    { key: 'invoice:SI-1042', label: 'Open SI-1042' },
    { key: 'customer:Lina Haddad', label: 'Open Lina Haddad' },
  ],
};
const QUESTION: ConversationItemView = {
  id: 'm0',
  role: 'user',
  author: 'You',
  blocks: [{ kind: 'paragraph', segments: [{ text: 'How much does Lina owe?', bold: false }] }],
  links: [],
};

async function render<T>(component: new () => T, inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('AssistantSuggestionsComponent', () => {
  const inputs = {
    label: 'Suggestions',
    suggestions: ["Today's sales", 'Who owes money?', 'Low stock items'],
  };

  it('shows each suggestion as a button in a labelled group', async () => {
    const fixture = await render(AssistantSuggestionsComponent, inputs);
    expect(el(fixture).querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Suggestions',
    );
    expect([...el(fixture).querySelectorAll('button')].map(text)).toEqual(inputs.suggestions);
  });

  it('emits the text of the suggestion pressed', async () => {
    const fixture = await render(AssistantSuggestionsComponent, inputs);
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((s) => picked.push(s));
    el(fixture).querySelectorAll('button')[1].click();
    expect(picked).toEqual(['Who owes money?']);
  });
});

describe('AssistantMessageComponent', () => {
  it('shows paragraphs, bold runs and lists as text, named for who wrote it', async () => {
    const fixture = await render(AssistantMessageComponent, { item: REPLY });
    const root = el(fixture);
    expect(root.querySelector('article')?.getAttribute('aria-label')).toBe('Assistant');
    expect(text(root.querySelector('p'))).toBe('Lina owes ILS 250.00 on SI-1042.');
    expect(text(root.querySelector('p strong'))).toBe('ILS 250.00');
    expect([...root.querySelectorAll('li')].map(text)).toEqual(['POT-30: 2', 'Seed mix: 0']);
    expect(text(root.querySelector('li strong'))).toBe('0');
  });

  it('puts the assistant at the start side and the user at the end side', async () => {
    const assistant = await render(AssistantMessageComponent, { item: REPLY });
    const user = await render(AssistantMessageComponent, { item: QUESTION });
    expect(el(assistant).classList.contains('assistant')).toBe(true);
    expect(el(user).classList.contains('user')).toBe(true);
    expect(el(user).querySelector('article')?.getAttribute('aria-label')).toBe('You');
  });

  it('never turns text into markup', async () => {
    const item: ConversationItemView = {
      ...QUESTION,
      blocks: [
        {
          kind: 'paragraph',
          segments: [{ text: '<img src=x onerror="window.hacked=1"><b>bold</b>', bold: false }],
        },
      ],
    };
    const fixture = await render(AssistantMessageComponent, { item });
    expect(el(fixture).querySelector('img')).toBeNull();
    expect(el(fixture).querySelector('b')).toBeNull();
    expect(text(el(fixture).querySelector('p'))).toBe(
      '<img src=x onerror="window.hacked=1"><b>bold</b>',
    );
  });

  it('shows a button for each record and emits its key', async () => {
    const fixture = await render(AssistantMessageComponent, { item: REPLY });
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((key) => opened.push(key));
    const buttons = [...el(fixture).querySelectorAll('button')];
    expect(buttons.map(text)).toEqual(['Open SI-1042', 'Open Lina Haddad']);
    buttons[1].click();
    expect(opened).toEqual(['customer:Lina Haddad']);
  });

  it('shows no buttons when there are no records', async () => {
    const fixture = await render(AssistantMessageComponent, { item: QUESTION });
    expect(el(fixture).querySelector('button')).toBeNull();
  });
});

describe('AssistantConversationComponent', () => {
  const inputs = { label: 'Conversation', items: [QUESTION, REPLY] };

  it('shows the bubbles in order in a labelled live log', async () => {
    const fixture = await render(AssistantConversationComponent, inputs);
    const log = el(fixture).querySelector('[role="log"]')!;
    expect(log.getAttribute('aria-label')).toBe('Conversation');
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect([...log.querySelectorAll('app-assistant-message')].map((m) => m.className)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('shows a muted line for each running lookup, and marks the log busy', async () => {
    const fixture = await render(AssistantConversationComponent, {
      ...inputs,
      activity: ['Looking up customers…', 'Looking up invoices…'],
      busy: true,
    });
    expect([...el(fixture).querySelectorAll('.activity')].map(text)).toEqual([
      'Looking up customers…',
      'Looking up invoices…',
    ]);
    expect(el(fixture).querySelector('[role="log"]')?.getAttribute('aria-busy')).toBe('true');
  });

  it('shows a notice under the conversation when something went wrong, and none otherwise', async () => {
    const fixture = await render(AssistantConversationComponent, {
      ...inputs,
      problem: 'The assistant is busy. Try again in a moment.',
    });
    expect(text(el(fixture).querySelector('app-feedback-card'))).toBe(
      'The assistant is busy. Try again in a moment.',
    );
    expect(el(fixture).querySelector('app-feedback-card')?.getAttribute('role')).toBe('status');
    const calm = await render(AssistantConversationComponent, inputs);
    expect(el(calm).querySelector('app-feedback-card')).toBeNull();
  });

  it('passes a record button press on', async () => {
    const fixture = await render(AssistantConversationComponent, inputs);
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((key) => opened.push(key));
    el(fixture).querySelectorAll<HTMLButtonElement>('app-assistant-message button')[0].click();
    expect(opened).toEqual(['invoice:SI-1042']);
  });
});

describe('AssistantComposerComponent', () => {
  const inputs = {
    label: 'Your message',
    placeholder: 'Ask the assistant…',
    note: 'The assistant looks things up. It never changes anything without you.',
    sendLabel: 'Send',
    stopLabel: 'Stop',
  };

  const field = (fixture: ComponentFixture<unknown>) =>
    el(fixture).querySelector('textarea') as HTMLTextAreaElement;
  const type = async (fixture: ComponentFixture<unknown>, value: string) => {
    field(fixture).value = value;
    field(fixture).dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const press = (fixture: ComponentFixture<unknown>, init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...init });
    field(fixture).dispatchEvent(event);
    return event;
  };
  const sends = (fixture: ComponentFixture<AssistantComposerComponent>) => {
    const sent: string[] = [];
    fixture.componentInstance.send.subscribe((s) => sent.push(s));
    return sent;
  };

  it('shows the note, a labelled field with the placeholder, and a Send button named Send', async () => {
    const fixture = await render(AssistantComposerComponent, inputs);
    expect(text(el(fixture).querySelector('.note'))).toBe(inputs.note);
    expect(field(fixture).getAttribute('aria-label')).toBe('Your message');
    expect(field(fixture).placeholder).toBe('Ask the assistant…');
    const send = el(fixture).querySelector<HTMLButtonElement>('button.send')!;
    expect(send.getAttribute('aria-label')).toBe('Send');
    expect(send.querySelector('svg')).not.toBeNull();
    expect(send.disabled).toBe(true);
  });

  it('sends the trimmed text from the button, once there is text', async () => {
    const fixture = await render(AssistantComposerComponent, inputs);
    const sent = sends(fixture);
    await type(fixture, '  How much does Lina owe?  ');
    const send = el(fixture).querySelector<HTMLButtonElement>('button.send')!;
    expect(send.disabled).toBe(false);
    send.click();
    expect(sent).toEqual(['How much does Lina owe?']);
  });

  it('sends on Enter and keeps the line break on Shift+Enter', async () => {
    const fixture = await render(AssistantComposerComponent, inputs);
    const sent = sends(fixture);
    await type(fixture, 'Hello');
    expect(press(fixture, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
    expect(press(fixture, {}).defaultPrevented).toBe(true);
    expect(sent).toEqual(['Hello']);
  });

  it('does not send on the Enter that confirms an input-method candidate', async () => {
    const fixture = await render(AssistantComposerComponent, inputs);
    const sent = sends(fixture);
    await type(fixture, 'مرحبا');
    press(fixture, { isComposing: true });
    expect(sent).toEqual([]);
  });

  it('does not send empty text', async () => {
    const fixture = await render(AssistantComposerComponent, inputs);
    const sent = sends(fixture);
    await type(fixture, '   ');
    press(fixture, {});
    expect(sent).toEqual([]);
  });

  it('waits while an answer is coming: Send is disabled, Enter sends nothing, Stop appears', async () => {
    const fixture = await render(AssistantComposerComponent, { ...inputs, busy: true });
    const sent = sends(fixture);
    await type(fixture, 'Another question');
    press(fixture, {});
    expect(sent).toEqual([]);
    expect(el(fixture).querySelector<HTMLButtonElement>('button.send')!.disabled).toBe(true);
    const stop = el(fixture).querySelector<HTMLButtonElement>('button.stop')!;
    expect(text(stop)).toBe('Stop');
    const stopped: unknown[] = [];
    fixture.componentInstance.stop.subscribe(() => stopped.push(true));
    stop.click();
    expect(stopped).toHaveLength(1);
  });

  it('offers no Stop when nothing is running', async () => {
    const fixture = await render(AssistantComposerComponent, inputs);
    expect(el(fixture).querySelector('button.stop')).toBeNull();
  });

  it('shows the text the page gives it and reports what is typed', async () => {
    const fixture = await render(AssistantComposerComponent, inputs);
    fixture.componentRef.setInput('value', 'Draft');
    await fixture.whenStable();
    expect(field(fixture).value).toBe('Draft');
    await type(fixture, 'Draft!');
    expect(fixture.componentInstance.value()).toBe('Draft!');
  });
});
