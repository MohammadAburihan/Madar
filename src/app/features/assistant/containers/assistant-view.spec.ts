import { realTranslator } from '../../../../testing/real-translator';
import { Language } from '../../../core/i18n/language.service';
import { ApiMessage, ProblemKind, RecordLink } from '../data-access/assistant.models';
import { AssistantViewInput, buildAssistantView, recordRoute } from './assistant-view';

const EMPTY: AssistantViewInput = {
  messages: [],
  links: {},
  streaming: '',
  state: 'idle',
  activeTools: [],
  problem: null,
};

const build = (over: Partial<AssistantViewInput> = {}, language: Language = 'en') =>
  buildAssistantView({ ...EMPTY, ...over }, realTranslator(language));
const plain = (value: string) => value.replace(/[⁦-⁩]/g, '');

const invoice = (id: string): RecordLink => ({ kind: 'invoice', id, label: id, mentions: [id] });
const customer: RecordLink = {
  kind: 'customer',
  id: 'Lina Haddad',
  label: 'Lina Haddad',
  mentions: ['Lina Haddad'],
};

describe('buildAssistantView', () => {
  it('words the empty screen and its three suggestions in English', () => {
    const view = build();
    expect(view).toMatchObject({
      title: 'Assistant',
      subtitle: 'Ask about customers, items, sales and stock',
      placeholder: 'Ask the assistant…',
      send: 'Send',
      stop: 'Stop',
      newChat: 'New chat',
      note: 'The assistant looks things up. It never changes anything without you.',
      suggestions: ["Today's sales", 'Who owes money?', 'Low stock items'],
      items: [],
      started: false,
      busy: false,
      problem: null,
    });
  });

  it('words it in Arabic', () => {
    expect(build({}, 'ar')).toMatchObject({
      title: 'المساعد',
      subtitle: 'اسأل عن العملاء والأصناف والمبيعات والمخزون',
      placeholder: 'اسأل المساعد…',
      send: 'إرسال',
      note: 'يبحث المساعد عن المعلومات، ولا يغيّر شيئاً دون موافقتك.',
      suggestions: ['مبيعات اليوم', 'من عليه مستحقات؟', 'الأصناف منخفضة المخزون'],
    });
  });

  it('shows the user at the end side as plain text and the assistant parsed, naming who wrote each', () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'How much does **Lina** owe?' },
      { role: 'assistant', content: [{ type: 'text', text: 'Lina owes **ILS 250.00**.' }] },
    ];
    const view = build({ messages });
    expect(view.started).toBe(true);
    expect(view.items).toEqual([
      {
        id: 'm0',
        role: 'user',
        author: 'You',
        blocks: [
          {
            kind: 'paragraph',
            segments: [{ text: 'How much does **Lina** owe?', bold: false }],
          },
        ],
        links: [],
      },
      {
        id: 'm1',
        role: 'assistant',
        author: 'Assistant',
        blocks: [
          {
            kind: 'paragraph',
            segments: [
              { text: 'Lina owes ', bold: false },
              { text: 'ILS 250.00', bold: true },
              { text: '.', bold: false },
            ],
          },
        ],
        links: [],
      },
    ]);
    expect(build({ messages }, 'ar').items.map((i) => i.author)).toEqual(['أنت', 'المساعد']);
  });

  it('leaves out tool results, tool calls and thinking, which are not conversation', () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'Sales?' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'secret', signature: 's' },
          { type: 'tool_use', id: 't1', name: 'get_today_summary', input: {} },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'ILS 100' }] },
    ];
    const view = build({ messages });
    expect(view.items.map((i) => i.id)).toEqual(['m0', 'm3']);
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('shows text the assistant wrote before a lookup', () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'Sales?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 't1', name: 'get_today_summary', input: {} },
        ],
      },
    ];
    expect(build({ messages }).items.map((i) => i.id)).toEqual(['m0', 'm1']);
  });

  it('adds the reply that is still streaming as the last bubble', () => {
    const view = build({
      messages: [{ role: 'user', content: 'Hi' }],
      streaming: 'Hel',
      state: 'sending',
    });
    expect(view.items.at(-1)).toMatchObject({ id: 'streaming', role: 'assistant' });
    expect(view.busy).toBe(true);
  });

  describe('open buttons', () => {
    const base = (text: string, records: RecordLink[]) =>
      build({
        messages: [
          { role: 'user', content: 'Q' },
          { role: 'assistant', content: [{ type: 'text', text }] },
        ],
        links: { 1: records },
      });

    it('offers only the records the reply mentions, once each', () => {
      const view = base('SI-1042 is unpaid. Also si-1042 again.', [
        invoice('SI-1042'),
        invoice('SI-1042'),
        invoice('SI-2000'),
      ]);
      expect(view.items[1].links).toEqual([{ key: 'invoice:SI-1042', label: expect.any(String) }]);
      expect(plain(view.items[1].links[0].label)).toBe('Open SI-1042');
    });

    it('words the button in Arabic', () => {
      const view = build(
        {
          messages: [
            { role: 'user', content: 'Q' },
            { role: 'assistant', content: [{ type: 'text', text: 'SI-1042' }] },
          ],
          links: { 1: [invoice('SI-1042')] },
        },
        'ar',
      );
      expect(plain(view.items[1].links[0].label)).toBe('فتح SI-1042');
    });

    it('matches a customer by name, in any case', () => {
      expect(base('lina haddad owes ILS 250.', [customer]).items[1].links).toEqual([
        { key: 'customer:Lina Haddad', label: expect.stringContaining('Lina Haddad') },
      ]);
    });

    it('offers nothing when no lookup returned a record, or the reply names none', () => {
      expect(base('Nothing owed.', []).items[1].links).toEqual([]);
      expect(base('Nothing owed.', [invoice('SI-1')]).items[1].links).toEqual([]);
    });

    it('offers at most five', () => {
      const ids = Array.from({ length: 8 }, (_, i) => `SI-${100 + i}`);
      const view = base(ids.join(' '), ids.map(invoice));
      expect(view.items[1].links).toHaveLength(5);
    });

    it("never offers buttons under the user's own message", () => {
      const view = build({
        messages: [{ role: 'user', content: 'Open SI-1' }],
        links: { 0: [invoice('SI-1')] },
      });
      expect(view.items[0].links).toEqual([]);
    });
  });

  describe('activity', () => {
    it('shows one muted line per running lookup, without repeating a line', () => {
      const view = build({
        state: 'running-tool',
        activeTools: ['search_customers', 'find_invoices', 'get_invoice', 'search_customers'],
      });
      expect(view.activity).toEqual(['Looking up customers…', 'Looking up invoices…']);
    });

    it.each([
      ['get_today_summary', "Checking today's figures…", 'يتحقق من أرقام اليوم…'],
      ['search_customers', 'Looking up customers…', 'يبحث في العملاء…'],
      ['search_items', 'Looking up items…', 'يبحث في الأصناف…'],
      ['find_invoices', 'Looking up invoices…', 'يبحث في الفواتير…'],
      ['list_drafts', 'Looking up drafts…', 'يبحث في المسودات…'],
      ['find_purchase_orders', 'Looking up purchase orders…', 'يبحث في أوامر الشراء…'],
    ] as const)('words %s in both languages', (name, en, ar) => {
      const input = { state: 'running-tool', activeTools: [name] } as const;
      expect(build(input).activity).toEqual([en]);
      expect(build(input, 'ar').activity).toEqual([ar]);
    });

    it('shows none while sending or idle', () => {
      expect(build({ state: 'sending', activeTools: ['search_items'] }).activity).toEqual([]);
      expect(build().activity).toEqual([]);
    });
  });

  describe('problems', () => {
    it.each([
      ['busy', 'The assistant is busy. Try again in a moment.', 'المساعد مشغول. حاول بعد لحظة.'],
      [
        'rate_limited',
        "You've reached today's assistant limit.",
        'وصلت إلى حدّ المساعد لهذا اليوم.',
      ],
      ['unavailable', "The assistant isn't available right now.", 'المساعد غير متاح الآن.'],
      [
        'refusal',
        "The assistant can't help with that.",
        'لا يستطيع المساعد المساعدة في هذا الطلب.',
      ],
    ] as [ProblemKind, string, string][])('words %s in both languages', (problem, en, ar) => {
      expect(build({ problem, state: 'failed' }).problem).toBe(en);
      expect(build({ problem, state: 'failed' }, 'ar').problem).toBe(ar);
    });
  });
});

describe('recordRoute', () => {
  it('goes to the page Madar already has for each kind of record', () => {
    expect(recordRoute('invoice:SI-1042')).toEqual(['/sales/invoices', 'SI-1042']);
    expect(recordRoute('customer:Lina Haddad')).toEqual(['/contacts/customers', 'Lina Haddad']);
    expect(recordRoute('item:POT-30')).toEqual(['/catalog', 'POT-30']);
    expect(recordRoute('purchaseOrder:PO-2048')).toEqual(['/purchases/order', 'PO-2048']);
    expect(recordRoute('draft:SI-D1')).toEqual(['/drafts']);
  });

  it('keeps a colon that is part of the name, and refuses an unknown kind', () => {
    expect(recordRoute('item:A:B')).toEqual(['/catalog', 'A:B']);
    expect(recordRoute('quote:Q-1')).toBeNull();
    expect(recordRoute('nonsense')).toBeNull();
  });
});
