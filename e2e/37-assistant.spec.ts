import { expect, test } from '@playwright/test';
import {
  answer,
  ask,
  bubbles,
  field,
  problem,
  scriptAssistant,
  sse,
  toolCall,
} from './assistant-support';
import { CUSTOMER, ITEM, erp, expectHeading, ils, named, signIn, toArabic } from './support';

/** What ERPNext says Lina Haddad owes on confirmed invoices, the truth the lookup must report. */
async function linaOwes(page: Page): Promise<number> {
  const rows = await erp(page).list<{ outstanding_amount: number }>(
    'Sales Invoice',
    ['outstanding_amount'],
    [
      ['customer', '=', CUSTOMER],
      ['docstatus', '=', 1],
      ['outstanding_amount', '>', 0],
    ],
  );
  return rows.reduce((sum, r) => sum + r.outstanding_amount, 0);
}

/** A confirmed, unpaid invoice for Lina, so there is a balance to find; cancelled again afterwards (ERPNext keeps it as Cancelled). */
async function withUnpaidInvoice(page: Page, run: () => Promise<void>) {
  const post = async <T>(method: string, data: unknown) => {
    const response = await page.request.post(`/api/method/${method}`, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { message: T }).message;
  };
  const [company] = await erp(page).list<{ name: string }>('Company', ['name']);
  const doc = await post<Record<string, unknown>>('frappe.client.insert', {
    doc: {
      doctype: 'Sales Invoice',
      company: company.name,
      customer: CUSTOMER,
      update_stock: 0,
      items: [{ item_code: ITEM.code, qty: 1, rate: 111 }],
    },
  });
  const submitted = await post<{ name: string }>('frappe.client.submit', { doc });
  try {
    await run();
  } finally {
    await post('frappe.client.cancel', { doctype: 'Sales Invoice', name: submitted.name });
  }
}

async function askAboutLina(page: Page) {
  await signIn(page, 'owner');
  await withUnpaidInvoice(page, async () => {
    const owes = await linaOwes(page);
    expect(owes).toBeGreaterThan(0);
    const requests = await scriptAssistant(page, [
      () => ({
        body: toolCall('t1', 'search_customers', { query: CUSTOMER, limit: 3 }, 'Let me look.'),
      }),
      (body) => {
        const results = body.messages.at(-1)!.content as { content: string }[];
        const found = JSON.parse(results[0].content) as { customers: { outstanding: number }[] };
        return {
          body: answer(
            `${CUSTOMER} owes **${ils(found.customers[0].outstanding)}** on confirmed invoices.`,
          ),
        };
      },
    ]);
    await page.goto('/assistant');
    await expectHeading(page, 'Assistant');
    await ask(page, `How much does ${CUSTOMER} owe?`);

    await expect(bubbles(page, 'user')).toHaveText(`How much does ${CUSTOMER} owe?`);
    const reply = bubbles(page, 'assistant').last();
    await expect(reply.locator('strong')).toHaveText(ils(owes), { timeout: 30_000 });
    await expect(reply).toContainText('on confirmed invoices.');
    await expect(field(page)).toHaveValue('');

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      language: 'en',
      context: { currency: 'ILS', persona: 'owner' },
      messages: [{ role: 'user', content: `How much does ${CUSTOMER} owe?` }],
    });
    expect(requests[0].tools).toHaveLength(16);
    const [question, call, result] = requests[1].messages;
    expect(question.role).toBe('user');
    expect(call).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me look.' },
        {
          type: 'tool_use',
          id: 't1',
          name: 'search_customers',
          input: { query: CUSTOMER, limit: 3 },
        },
      ],
    });
    const [toolResult] = result.content as {
      type: string;
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }[];
    expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(toolResult.is_error).toBeUndefined();
    const found = JSON.parse(toolResult.content) as {
      currency: string;
      customers: { name: string; outstanding: number }[];
    };
    expect(found.currency).toBe('ILS');
    expect(found.customers[0]).toMatchObject({ name: CUSTOMER, outstanding: owes });

    await reply.getByRole('button', { name: named('Open', CUSTOMER) }).click();
    await expect(page).toHaveURL(/\/contacts\/customers\/Lina%20Haddad$/);
    await expectHeading(page, CUSTOMER);
  });
}

test('asks what a customer owes, runs the lookup on ERPNext and opens the customer @phone', async ({
  page,
}) => {
  await askAboutLina(page);
});

test('asks what a customer owes, runs the lookup on ERPNext and opens the customer @desktop', async ({
  page,
}) => {
  await askAboutLina(page);
});

test('offers suggestions, sends one, and starts a new chat @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  const requests = await scriptAssistant(page, [
    () => ({ body: answer('Nothing sold yet today.') }),
    () => ({ body: answer('Nobody owes money.') }),
  ]);
  await page.goto('/assistant');
  await expectHeading(page, 'Assistant');
  await expect(page.locator('app-page-heading p')).toHaveText(
    'Ask about customers, items, sales and stock',
  );
  await expect(page.locator('app-assistant-suggestions button')).toHaveText([
    "Today's sales",
    'Who owes money?',
    'Low stock items',
  ]);
  await expect(
    page.getByText('The assistant looks things up. It never changes anything without you.'),
  ).toBeVisible();
  await expect(field(page)).toHaveAttribute('placeholder', 'Ask the assistant…');
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'New chat' })).toHaveCount(0);

  await page.getByRole('button', { name: "Today's sales" }).click();
  await expect(bubbles(page, 'user')).toHaveText("Today's sales");
  await expect(bubbles(page, 'assistant')).toHaveText('Nothing sold yet today.');
  expect(requests[0].messages).toEqual([{ role: 'user', content: "Today's sales" }]);
  await expect(page.locator('app-assistant-suggestions')).toHaveCount(0);

  // The conversation is kept when the user leaves and comes back.
  await page.getByRole('navigation').first().getByRole('link', { name: 'Home' }).click();
  await page.getByRole('navigation').first().getByRole('link', { name: 'Assistant' }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(bubbles(page, 'assistant')).toHaveText('Nothing sold yet today.');

  await field(page).fill('Who owes money?\nPlease list them');
  await field(page).press('Enter');
  await expect(bubbles(page, 'assistant').last()).toHaveText('Nobody owes money.');
  expect(requests[1].messages).toHaveLength(3);

  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(bubbles(page, 'user')).toHaveCount(0);
  await expect(page.locator('app-assistant-suggestions button')).toHaveCount(3);
});

test('reaches the assistant from More on the phone @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.getByRole('link', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Assistant' }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expectHeading(page, 'Assistant');
  await expect(page.locator('app-assistant-composer')).toBeInViewport();
});

test('says what went wrong and keeps the conversation @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const requests = await scriptAssistant(page, [
    () => problem(429, 'busy', { 'Retry-After': '2' }),
    () => problem(429, 'rate_limited', { 'Retry-After': '3600' }),
    () => problem(503, 'unavailable'),
    () => ({ status: 404, headers: { 'Content-Type': 'text/html' }, body: 'Not found' }),
    () => ({ body: sse(['error', { code: 'refusal' }]) }),
    () => ({ body: answer('Back again.') }),
  ]);
  await page.goto('/assistant');
  const notice = page.locator('app-assistant-conversation app-feedback-card');
  const cases: [string, string][] = [
    ['one', 'The assistant is busy. Try again in a moment.'],
    ['two', "You've reached today's assistant limit."],
    ['three', "The assistant isn't available right now."],
    ['four', "The assistant isn't available right now."],
    ['five', "The assistant can't help with that."],
  ];
  for (const [question, message] of cases) {
    await ask(page, question);
    await expect(notice).toHaveText(message);
    await expect(bubbles(page, 'user').last()).toHaveText(question);
  }
  await expect(bubbles(page, 'user')).toHaveCount(5);

  await ask(page, 'six');
  await expect(bubbles(page, 'assistant')).toHaveText('Back again.');
  await expect(notice).toHaveCount(0);
  expect(requests).toHaveLength(6);
  expect(requests[5].messages.filter((m) => m.role === 'user')).toHaveLength(6);
});

test('stops waiting for an answer when asked @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.route('**/assistant/chat', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    await route.fulfill({ body: answer('Too late.') }).catch(() => undefined);
  });
  await page.goto('/assistant');
  await ask(page, 'Slow question');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  await expect(bubbles(page, 'user')).toHaveText('Slow question');
  await expect(page.locator('app-assistant-conversation app-feedback-card')).toHaveCount(0);
  await expect(bubbles(page, 'assistant')).toHaveCount(0);
});

test('talks in Arabic, right to left @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const requests = await scriptAssistant(page, [
    () => ({ body: answer('لا توجد مبيعات اليوم بعد.') }),
  ]);
  await page.goto('/assistant');
  await toArabic(page);
  await expectHeading(page, 'المساعد');
  await expect(page.locator('app-page-heading p')).toHaveText(
    'اسأل عن العملاء والأصناف والمبيعات والمخزون',
  );
  await expect(field(page)).toHaveAttribute('placeholder', 'اسأل المساعد…');
  await expect(page.getByRole('button', { name: 'إرسال' })).toBeDisabled();
  await expect(
    page.getByText('يبحث المساعد عن المعلومات، ولا يغيّر شيئاً دون موافقتك.'),
  ).toBeVisible();
  await expect(page.locator('app-assistant-suggestions button')).toHaveText([
    'مبيعات اليوم',
    'من عليه مستحقات؟',
    'الأصناف منخفضة المخزون',
  ]);

  await page.getByRole('button', { name: 'مبيعات اليوم' }).click();
  await expect(bubbles(page, 'user')).toHaveText('مبيعات اليوم');
  await expect(bubbles(page, 'assistant')).toHaveText('لا توجد مبيعات اليوم بعد.');
  expect(requests[0]).toMatchObject({
    language: 'ar',
    messages: [{ role: 'user', content: 'مبيعات اليوم' }],
  });
  await expect(page.getByRole('button', { name: 'محادثة جديدة' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('shows the lookup in progress in Arabic, then opens an invoice @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  const [invoice] = await erp(page).list<{ name: string }>(
    'Sales Invoice',
    ['name'],
    [['docstatus', '=', 1]],
  );
  expect(invoice, 'a confirmed invoice on the test site').toBeTruthy();
  await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'get_invoice', { name: invoice.name }) }),
    (body) => {
      const results = body.messages.at(-1)!.content as { content: string }[];
      const found = JSON.parse(results[0].content) as { name: string };
      return { body: answer(`هذه هي الفاتورة ${found.name}.`) };
    },
  ]);
  await page.goto('/assistant');
  await toArabic(page);
  await ask(page, 'أرني فاتورة');
  const reply = bubbles(page, 'assistant').last();
  await expect(reply).toContainText(invoice.name, { timeout: 30_000 });
  await reply.getByRole('button', { name: named('فتح', invoice.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/sales/invoices/${invoice.name}$`));
});

test('sends a salesperson only the lookups their role allows, and only their own sales @phone', async ({
  page,
}) => {
  await signIn(page, 'salesperson');
  const requests = await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'get_today_summary', {}) }),
    () => ({ body: answer('Here are your sales.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, 'How are my sales?');
  await expect(bubbles(page, 'assistant')).toHaveText('Here are your sales.', { timeout: 30_000 });
  expect(requests[0].context.persona).toBe('salesperson');
  expect(requests[0].tools).toEqual([
    'get_today_summary',
    'search_customers',
    'search_items',
    'find_invoices',
    'get_invoice',
    'list_drafts',
    'propose_quick_sale',
    'propose_quotation',
    'propose_collect_payment',
    'propose_new_customer',
    'open_record',
  ]);
  expect(requests[0].tools).not.toContain('find_purchase_orders');
  const [result] = requests[1].messages.at(-1)!.content as { content: string }[];
  expect(JSON.parse(result.content)).toMatchObject({ scope: 'your own sales', currency: 'ILS' });
});

test('answers a lookup the role may not run with an error, not with data @desktop', async ({
  page,
}) => {
  await signIn(page, 'salesperson');
  const requests = await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'find_purchase_orders', {}) }),
    () => ({ body: answer('I cannot see purchase orders for you.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, 'Which purchase orders are open?');
  await expect(bubbles(page, 'assistant')).toHaveText('I cannot see purchase orders for you.', {
    timeout: 30_000,
  });
  expect(requests[1].messages.at(-1)!.content).toEqual([
    {
      type: 'tool_result',
      tool_use_id: 't1',
      content: 'not allowed for your role',
      is_error: true,
    },
  ]);
});
