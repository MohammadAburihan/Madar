import { realTranslator } from '../../../../testing/real-translator';
import { Language } from '../../../core/i18n/language.service';
import { ApiMessage, ProblemKind, Proposal, RecordLink } from '../data-access/assistant.models';
import {
  AssistantViewInput,
  buildAssistantView,
  proposalCard,
  proposalTarget,
  recordRoute,
} from './assistant-view';

const EMPTY: AssistantViewInput = {
  messages: [],
  links: {},
  proposals: {},
  choices: {},
  currency: 'ILS',
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
        proposals: [],
        choices: [],
        choicesLabel: 'Choose one',
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
        proposals: [],
        choices: [],
        choicesLabel: 'Choose one',
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

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: 'PRP-1',
  kind: 'quick_sale',
  party: 'Lina Haddad',
  item: null,
  lines: [{ name: 'Olive tree · 20 L', qty: 2, amount: 170 }],
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
  ...over,
});

const card = (p: Proposal, language: Language = 'en') => {
  const view = proposalCard(p, 'ILS', realTranslator(language));
  return { ...view, title: plain(view.title), lines: view.lines.map(plain) };
};

describe('proposalCard', () => {
  it('words a sale with its lines from the real prices, the total and the reminder, in English', () => {
    expect(card(proposal())).toEqual({
      id: 'PRP-1',
      title: 'Sale to Lina Haddad',
      lines: ['2 × Olive tree · 20 L — ILS 170.00', 'Total ILS 170.00'],
      note: 'Nothing is saved until you confirm.',
      action: 'Review sale',
    });
  });

  it('words a sale in Arabic', () => {
    expect(card(proposal({ party: 'لينا الحداد' }), 'ar')).toEqual({
      id: 'PRP-1',
      title: 'بيع إلى لينا الحداد',
      lines: ['2 × Olive tree · 20 L — ILS 170.00', 'الإجمالي ILS 170.00'],
      note: 'لا يُحفظ شيء حتى تؤكّد.',
      action: 'مراجعة البيع',
    });
  });

  it('words a walk-in sale without a name', () => {
    expect(card(proposal({ party: null })).title).toBe('Walk-in sale');
    expect(card(proposal({ party: null }), 'ar').title).toBe('بيع لعميل نقدي');
  });

  it('words a quotation, with a line that has no price and no total', () => {
    expect(
      card(
        proposal({
          kind: 'quotation',
          lines: [{ name: 'Garden consultation', qty: 1, amount: null }],
          total: null,
        }),
      ),
    ).toEqual({
      id: 'PRP-1',
      title: 'Quotation for Lina Haddad',
      lines: ['1 × Garden consultation'],
      note: 'Nothing is saved until you confirm.',
      action: 'Review quotation',
    });
    expect(card(proposal({ kind: 'quotation' }), 'ar')).toMatchObject({
      title: 'عرض سعر لـ Lina Haddad',
      action: 'مراجعة عرض السعر',
    });
  });

  it('words a purchase order', () => {
    const order = proposal({ kind: 'purchase_order', party: 'Green Clay' });
    expect(card(order)).toMatchObject({
      title: 'Purchase from Green Clay',
      action: 'Review purchase order',
    });
    expect(card(order, 'ar')).toMatchObject({
      title: 'شراء من Green Clay',
      action: 'مراجعة أمر الشراء',
    });
  });

  it('words a payment to collect, with what is owed', () => {
    const base = proposal({ kind: 'collect_payment', lines: [], total: null, due: 460 });
    expect(card({ ...base, amount: 100 })).toEqual({
      id: 'PRP-1',
      title: 'Payment from Lina Haddad',
      lines: ['Amount to collect: ILS 100.00', 'Outstanding: ILS 460.00'],
      note: 'Nothing is saved until you confirm.',
      action: 'Collect payment',
    });
    expect(card(base).lines).toEqual(['The full amount due', 'Outstanding: ILS 460.00']);
    expect(card({ ...base, due: null, amount: 100 }).lines).toEqual([
      'Amount to collect: ILS 100.00',
    ]);
    expect(card({ ...base, amount: 100 }, 'ar')).toMatchObject({
      title: 'دفعة من Lina Haddad',
      lines: ['المبلغ المراد تحصيله: ILS 100.00', 'المتبقي: ILS 460.00'],
      action: 'تحصيل دفعة',
    });
  });

  it('words a stock move with its locations, and "any location" for one not named', () => {
    const move = proposal({
      kind: 'stock_move',
      party: null,
      item: 'Olive tree · 20 L',
      lines: [{ name: 'Olive tree · 20 L', qty: 5, amount: null }],
      total: null,
      from: 'Main warehouse',
      to: 'Garden shop',
    });
    expect(card(move)).toEqual({
      id: 'PRP-1',
      title: 'Stock move: Olive tree · 20 L',
      lines: ['5 × Olive tree · 20 L', 'Main warehouse → Garden shop'],
      note: 'Nothing is saved until you confirm.',
      action: 'Review stock move',
    });
    expect(card({ ...move, to: null }).lines[1]).toBe('Main warehouse → any location');
    expect(card({ ...move, from: null, to: null }).lines).toEqual(['5 × Olive tree · 20 L']);
    expect(card(move, 'ar')).toMatchObject({
      title: 'نقل مخزون: Olive tree · 20 L',
      lines: ['5 × Olive tree · 20 L', 'Main warehouse ← Garden shop'],
      action: 'مراجعة نقل المخزون',
    });
  });

  it('words a record to open, with no reminder, a draft as a draft', () => {
    const record = proposal({
      kind: 'open_record',
      party: 'SI-1042',
      lines: [],
      total: null,
      request: null,
      record: { kind: 'invoice', id: 'SI-1042', label: 'SI-1042', draft: false },
    });
    expect(card(record)).toEqual({
      id: 'PRP-1',
      title: 'Invoice SI-1042',
      lines: [],
      note: null,
      action: 'Open record',
    });
    expect(card(record, 'ar')).toMatchObject({
      title: 'فاتورة البيع SI-1042',
      action: 'فتح السجل',
    });
    const draft = { ...record.record!, draft: true };
    expect(card({ ...record, record: draft }).title).toBe('Draft SI-1042');
    expect(card({ ...record, record: draft }, 'ar').title).toBe('مسودة SI-1042');
    for (const [kind, title] of [
      ['quotation', 'Quotation SI-1042'],
      ['salesOrder', 'Sales order SI-1042'],
      ['purchaseOrder', 'Purchase order SI-1042'],
      ['customer', 'Customer SI-1042'],
      ['supplier', 'Supplier SI-1042'],
      ['item', 'Item SI-1042'],
    ] as const) {
      expect(card({ ...record, record: { ...record.record!, kind } }).title).toBe(title);
    }
  });
});

describe('proposalTarget', () => {
  it('opens each task at its first step with the proposal’s id', () => {
    const each: [Proposal['request'], string[]][] = [
      [{ kind: 'quick_sale', payload: { walkIn: true, lines: [] } }, ['/sales/new', 'basket']],
      [{ kind: 'quotation', payload: { customer: 'L', lines: [] } }, ['/sales/quote/new']],
      [{ kind: 'purchase_order', payload: { supplier: 'S', lines: [] } }, ['/purchases/new']],
      [{ kind: 'collect_payment', payload: { customer: 'L' } }, ['/money/receive']],
      [{ kind: 'stock_move', payload: { item_code: 'I', qty: 1 } }, ['/inventory/transfer']],
    ];
    for (const [request, commands] of each) {
      expect(proposalTarget(proposal({ request }), 'PF-1')).toEqual({
        commands,
        queryParams: { prefill: 'PF-1' },
      });
    }
  });

  it('goes nowhere for a task whose proposal could not be handed over', () => {
    expect(proposalTarget(proposal(), null)).toBeNull();
  });

  it('opens a record on its own page, with no proposal to hand over', () => {
    const open = (kind: 'invoice' | 'quotation' | 'salesOrder' | 'supplier', id: string) =>
      proposalTarget(
        proposal({
          kind: 'open_record',
          request: null,
          record: { kind, id, label: id, draft: false },
        }),
        null,
      );
    expect(open('invoice', 'SI-1')).toEqual({ commands: ['/sales/invoices', 'SI-1'] });
    expect(open('quotation', 'QN-1')).toEqual({ commands: ['/sales/quotes', 'QN-1'] });
    expect(open('salesOrder', 'SO-1')).toEqual({ commands: ['/sales/orders', 'SO-1'] });
    expect(open('supplier', 'SUP-1')).toEqual({ commands: ['/contacts/suppliers', 'SUP-1'] });
  });
});

describe('buildAssistantView proposals and choices', () => {
  const messages: ApiMessage[] = [
    { role: 'user', content: 'Sell 2 olive trees to Lina' },
    { role: 'assistant', content: [{ type: 'text', text: 'Please review it.' }] },
  ];

  it('puts the cards under the reply that made them, built in the business currency', () => {
    const view = build({ messages, proposals: { 1: [proposal()] } });
    expect(view.items[0].proposals).toEqual([]);
    expect(view.items[1].proposals.map((c) => c.id)).toEqual(['PRP-1']);
    expect(plain(view.items[1].proposals[0].lines[0])).toBe('2 × Olive tree · 20 L — ILS 170.00');
    expect(
      build({ messages, proposals: { 1: [proposal()] }, currency: 'USD' }).items[1].proposals[0]
        .lines[0],
    ).toContain('USD 170.00');
  });

  it('offers the choices only while that question is the last thing said', () => {
    const choices = {
      1: [
        { id: 'C-1', label: 'Lina Haddad' },
        { id: 'C-2', label: 'Lina Khoury' },
      ],
    };
    const open = build({ messages, choices });
    expect(open.items[1].choices).toEqual([
      { id: 'C-1', label: 'Lina Haddad' },
      { id: 'C-2', label: 'Lina Khoury' },
    ]);
    expect(open.items[1].choicesLabel).toBe('Choose one');
    expect(build({ messages, choices }, 'ar').items[1].choicesLabel).toBe('اختر واحداً');
    const answered = build({
      messages: [...messages, { role: 'user', content: 'Lina Khoury' }],
      choices,
    });
    expect(answered.items[1].choices).toEqual([]);
  });

  it('gives the user’s own messages no cards and no choices', () => {
    const view = build({
      messages,
      proposals: { 0: [proposal()] },
      choices: { 0: [{ id: 'x', label: 'x' }] },
    });
    expect(view.items[0].proposals).toEqual([]);
    expect(view.items[0].choices).toEqual([]);
  });
});
