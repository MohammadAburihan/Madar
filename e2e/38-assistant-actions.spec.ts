import { Page, expect, test } from '@playwright/test';
import { answer, ask, bubbles, scriptAssistant, toolCall } from './assistant-support';
import type { ChatBody } from './assistant-support';
import {
  CUSTOMER,
  ITEM,
  MAIN,
  SUPPLIER,
  erp,
  expectHeading,
  ils,
  named,
  plain,
  runId,
  signIn,
  toArabic,
  topUp,
} from './support';

const OLIVE = { code: 'OLV-20', name: 'Olive tree · 20 L' };
const GARDEN = 'Garden shop';

const card = (page: Page) => page.locator('app-assistant-proposal');
const notice = (page: Page, title: string) => page.locator('app-feedback-card', { hasText: title });

async function post<T>(page: Page, method: string, data: unknown): Promise<T> {
  const response = await page.request.post(`/api/method/${method}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: T }).message;
}

/** What ERPNext lists as the standard selling price: the price a proposal's card must show. */
async function listPrice(page: Page, code: string): Promise<number> {
  const [row] = await erp(page).list<{ price_list_rate: number }>(
    'Item Price',
    ['price_list_rate'],
    [
      ['item_code', '=', code],
      ['price_list', '=', 'Standard Selling'],
    ],
  );
  expect(row, `a selling price for ${code}`).toBeTruthy();
  return row.price_list_rate;
}

/** The result the page sent back for the last tool call, as the assistant would read it. */
function lastResult(body: ChatBody): { content: string; is_error?: boolean } {
  const [result] = body.messages.at(-1)!.content as { content: string; is_error?: boolean }[];
  return result;
}

const invoiceCount = async (page: Page, customer: string) =>
  (
    await erp(page).list<{ name: string }>(
      'Sales Invoice',
      ['name'],
      [
        ['customer', '=', customer],
        ['docstatus', '<', 2],
      ],
    )
  ).length;

/** The invoice number on the receipt's subtitle. */
async function receiptInvoice(page: Page): Promise<string> {
  const subtitle = await page.locator('app-page-heading p').first().innerText();
  return plain(subtitle.split(' · ')[0]);
}

async function proposeOliveSale(page: Page, qty = 2, rate?: number) {
  return scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_quick_sale', {
        customer: CUSTOMER,
        items: [{ item: 'Olive tree', qty, ...(rate !== undefined ? { rate } : {}) }],
      }),
    }),
    () => ({ body: answer('I prepared the sale. Review it and confirm.') }),
  ]);
}

async function sellsWhatTheAssistantProposed(page: Page, desktop: boolean) {
  await signIn(page, 'owner');
  await topUp(page, OLIVE.code, MAIN, 30);
  const price = await listPrice(page, OLIVE.code);
  // With no warehouse named, the sale comes from the one holding the most of the item.
  const bins = await erp(page).list<{ warehouse: string; actual_qty: number }>(
    'Bin',
    ['warehouse', 'actual_qty'],
    [['item_code', '=', OLIVE.code]],
  );
  const fullest = bins.sort((a, b) => b.actual_qty - a.actual_qty)[0].warehouse;
  const requests = await proposeOliveSale(page);
  const invoicesBefore = await invoiceCount(page, CUSTOMER);
  await page.goto('/assistant');
  await expectHeading(page, 'Assistant');
  await ask(page, `Sell 2 olive trees to ${CUSTOMER}`);

  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  await expect(card(page)).toContainText(named('Sale to', CUSTOMER));
  await expect(card(page)).toContainText(named('2', '×', OLIVE.name, '—', ils(2 * price)));
  await expect(card(page)).toContainText(named('Total', ils(2 * price)));
  await expect(card(page)).toContainText('Nothing is saved until you confirm.');
  await expect(bubbles(page, 'assistant').last()).toContainText('Review it and confirm.');
  const result = JSON.parse(lastResult(requests[1]).content) as Record<string, string>;
  expect(result['proposal_id']).toMatch(/^PRP-/);
  expect(result['summary']).toContain('Sale to Lina Haddad');
  // The assistant wrote nothing: the proposal is only a card until the user confirms in the task.
  expect(await invoiceCount(page, CUSTOMER)).toBe(invoicesBefore);

  await card(page).getByRole('button', { name: 'Review sale' }).click();
  await expect(page).toHaveURL(desktop ? /\/sales\/new\/items$/ : /\/sales\/new\/basket\?prefill=/);
  const filled = notice(page, 'Filled in by the assistant');
  await expect(filled).toContainText('Check the items, prices and customer, then confirm.');
  if (desktop) {
    await expect(page.locator('section.panel')).toContainText(OLIVE.name);
    await expect(page.locator('section.panel')).toContainText(named('2', '×', ils(price)));
    await expect(page.locator('section.panel')).toContainText(ils(2 * price));
    await expect(page.locator('section.panel select option:checked')).toContainText(
      fullest.replace(/ - [A-Z]+$/, ''),
    );
    await page.getByRole('button', { name: 'Review & payment' }).click();
  } else {
    await expect(page.locator('app-page-heading p').first()).toContainText(CUSTOMER);
    await expect(page.locator('app-item-card', { hasText: OLIVE.name })).toContainText(
      named('2', '×', price.toFixed(2), '=', ils(2 * price)),
    );
    await page.getByRole('button', { name: 'Continue to payment' }).click();
  }
  await expect(page).toHaveURL(/\/sales\/new\/review$/);
  await page.getByRole('button', { name: /^Confirm sale/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  await expectHeading(page, 'Sale confirmed');

  const invoice = await receiptInvoice(page);
  const doc = await erp(page).doc<{
    customer: string;
    docstatus: number;
    remarks: string;
    items: { item_code: string; qty: number; rate: number; warehouse: string }[];
  }>('Sales Invoice', invoice);
  expect(doc.customer).toBe(CUSTOMER);
  expect(doc.items[0].warehouse).toBe(fullest);
  expect(doc.docstatus).toBe(1);
  expect(doc.items.map((i) => [i.item_code, i.qty, i.rate])).toEqual([[OLIVE.code, 2, price]]);
  // Posted once, under the reference the task made for it.
  const reference = doc.remarks.match(/SALE-[0-9A-Z]{7}/)![0];
  const posted = await erp(page).list<{ name: string }>(
    'Sales Invoice',
    ['name'],
    [['remarks', 'like', `%${reference}%`]],
  );
  expect(posted).toEqual([{ name: invoice }]);
  expect(await invoiceCount(page, CUSTOMER)).toBe(invoicesBefore + 1);
}

test('proposes a sale, opens it filled in on the phone, and posts it once when confirmed @phone', async ({
  page,
}) => {
  await sellsWhatTheAssistantProposed(page, false);
});

test('proposes a sale, opens it filled in on the desktop workspace, and posts it once when confirmed @desktop', async ({
  page,
}) => {
  await sellsWhatTheAssistantProposed(page, true);
});

test('asks which customer when a name fits several, and sends the pick as the next message @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const tag = runId();
  const names = [`E2E Amira ${tag} Saleh`, `E2E Amira ${tag} Nasser`];
  const made: string[] = [];
  for (const customer_name of names) {
    const doc = await post<{ name: string }>(page, 'frappe.client.insert', {
      doc: { doctype: 'Customer', customer_name, customer_type: 'Individual' },
    });
    made.push(doc.name);
  }
  try {
    const items = [{ item: ITEM.code, qty: 1 }];
    const requests = await scriptAssistant(page, [
      () => ({
        body: toolCall('t1', 'propose_quick_sale', { customer: `E2E Amira ${tag}`, items }),
      }),
      () => ({ body: answer('Which Amira do you mean?') }),
      (body) => {
        const options = (
          JSON.parse((body.messages[2].content as { content: string }[])[0].content) as {
            options: { id: string; label: string }[];
          }
        ).options;
        const picked = options.find((o) => o.label === body.messages.at(-1)!.content)!;
        return { body: toolCall('t2', 'propose_quick_sale', { customer: picked.id, items }) };
      },
      () => ({ body: answer('Review the sale and confirm.') }),
    ]);
    await page.goto('/assistant');
    await ask(page, 'Sell a planter to Amira');

    const buttons = page.locator('app-assistant-choices button');
    await expect(buttons).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('app-assistant-choices [role="group"]')).toHaveAttribute(
      'aria-label',
      'Choose one',
    );
    expect((await buttons.allInnerTexts()).sort()).toEqual([...names].sort());
    await expect(card(page)).toHaveCount(0);
    const asked = JSON.parse(
      (requests[1].messages[2].content as { content: string }[])[0].content,
    ) as { needs_choice: boolean; field: string; options: { id: string; label: string }[] };
    expect(asked).toMatchObject({ needs_choice: true, field: 'customer' });
    expect(asked.options.map((o) => o.label).sort()).toEqual([...names].sort());

    await buttons.filter({ hasText: 'Nasser' }).click();
    await expect(bubbles(page, 'user').last()).toHaveText(names[1]);
    expect(requests[2].messages.at(-1)).toEqual({ role: 'user', content: names[1] });
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    await expect(card(page)).toContainText(named('Sale to', names[1]));
    await expect(page.locator('app-assistant-choices')).toHaveCount(0);
  } finally {
    for (const name of made) {
      await page.request.post('/api/method/frappe.client.delete', {
        data: { doctype: 'Customer', name },
      });
    }
  }
});

test('proposes a purchase order, opens it filled in, and confirms it @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_purchase_order', {
        supplier: SUPPLIER,
        items: [{ item: ITEM.code, qty: 5 }],
      }),
    }),
    () => ({ body: answer('I prepared the order. Review it and confirm.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Order 5 planters from ${SUPPLIER}`);
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  await expect(card(page)).toContainText(named('Purchase from', SUPPLIER));
  const line = plain(await card(page).locator('li').first().innerText());
  const amount = Number(line.match(/ILS ([\d,]+\.\d{2})/)![1].replace(/,/g, ''));
  expect(line).toMatch(new RegExp(`^5 × ${ITEM.name} — ILS`));
  const orders = () =>
    erp(page).list<{ name: string }>(
      'Purchase Order',
      ['name'],
      [
        ['supplier_name', '=', SUPPLIER],
        ['docstatus', '<', 2],
      ],
    );
  const before = (await orders()).length;

  await card(page).getByRole('button', { name: 'Review purchase order' }).click();
  await expect(page).toHaveURL(/\/purchases\/new\?prefill=/);
  await expectHeading(page, 'New purchase order');
  await expect(notice(page, 'Filled in by the assistant')).toContainText(
    'Check the items, prices and supplier, then confirm.',
  );
  await expect(
    page.locator('app-select-field select').first().locator('option:checked'),
  ).toContainText(SUPPLIER);
  await expect(page.locator('app-quantity-stepper').first()).toContainText('5');
  expect(await orders()).toHaveLength(before);

  await page.getByRole('button', { name: 'Review purchase order' }).click();
  await expect(page).toHaveURL(/\/purchases\/new\/review$/);
  await page.getByRole('button', { name: 'Confirm purchase order' }).click();
  await expect(page).toHaveURL(/\/purchases\/order\/[^/]+$/, { timeout: 60_000 });
  const order = decodeURIComponent(page.url().split('/').pop()!);
  const doc = await erp(page).doc<{
    supplier_name: string;
    docstatus: number;
    order_confirmation_no: string;
    items: { item_code: string; qty: number; rate: number }[];
  }>('Purchase Order', order);
  expect(doc).toMatchObject({ supplier_name: SUPPLIER, docstatus: 1 });
  expect(doc.items.map((i) => [i.item_code, i.qty, i.rate * i.qty])).toEqual([
    [ITEM.code, 5, amount],
  ]);
  expect(doc.order_confirmation_no).toMatch(/^PUR-/);
  expect(await orders()).toHaveLength(before + 1);
});

test('proposes a quotation at a price the owner stated, opens it filled in, and confirms it @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const price = 40;
  await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_quotation', {
        customer: CUSTOMER,
        items: [{ item: 'Ceramic planter', qty: 3, rate: price }],
      }),
    }),
    () => ({ body: answer('I prepared the quotation. Review it and confirm.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Quote 3 planters for ${CUSTOMER} at 40 each`);
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  await expect(card(page)).toContainText(named('Quotation for', CUSTOMER));
  await expect(card(page)).toContainText(named('3', '×', ITEM.name, '—', ils(3 * price)));
  await card(page).getByRole('button', { name: 'Review quotation' }).click();

  await expect(page).toHaveURL(/\/sales\/quote\/new\?prefill=/);
  await expectHeading(page, 'New quotation');
  await expect(notice(page, 'Filled in by the assistant')).toContainText(
    'Check the items, prices and customer, then confirm.',
  );
  await expect(page.locator('app-person-card', { hasText: CUSTOMER })).toBeVisible();
  await expect(page.locator('app-item-card', { hasText: ITEM.name })).toContainText(
    named('3', '×', ils(price)),
  );
  await page.getByRole('button', { name: 'Confirm quotation' }).click();
  await expect(page).toHaveURL(/\/sales\/quotes\/[^/]+$/, { timeout: 60_000 });
  const name = decodeURIComponent(page.url().split('/').pop()!);
  const doc = await erp(page).doc<{
    party_name: string;
    docstatus: number;
    utm_content: string;
    items: { item_code: string; qty: number; rate: number }[];
  }>('Quotation', name);
  expect(doc).toMatchObject({ party_name: CUSTOMER, docstatus: 1 });
  expect(doc.items.map((i) => [i.item_code, i.qty, i.rate])).toEqual([[ITEM.code, 3, price]]);
  expect(doc.utm_content).toMatch(/^QUO-/);
});

test('proposes collecting a payment, opens it with the amount filled in, and records it @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const customer = `E2E Payer ${runId()}`;
  const made = await post<{ name: string }>(page, 'frappe.client.insert', {
    doc: { doctype: 'Customer', customer_name: customer, customer_type: 'Individual' },
  });
  const [company] = await erp(page).list<{ name: string }>('Company', ['name']);
  const draft = await post<Record<string, unknown>>(page, 'frappe.client.insert', {
    doc: {
      doctype: 'Sales Invoice',
      company: company.name,
      customer: made.name,
      update_stock: 0,
      items: [{ item_code: ITEM.code, qty: 1, rate: 111 }],
    },
  });
  const invoice = await post<{ name: string }>(page, 'frappe.client.submit', { doc: draft });
  let payment = '';
  try {
    await scriptAssistant(page, [
      () => ({
        body: toolCall('t1', 'propose_collect_payment', { customer: customer, amount: 50 }),
      }),
      () => ({ body: answer('I prepared the payment. Review it and confirm.') }),
    ]);
    await page.goto('/assistant');
    await ask(page, `${customer} paid 50`);
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    await expect(card(page)).toContainText(named('Payment from', customer));
    await expect(card(page)).toContainText(named('Amount to collect:', ils(50)));
    await expect(card(page)).toContainText(named('Outstanding:', ils(111)));
    await card(page).getByRole('button', { name: 'Collect payment' }).click();

    await expect(page).toHaveURL(/\/money\/receive\?prefill=/);
    await expectHeading(page, 'Receive customer payment');
    await expect(notice(page, 'Filled in by the assistant')).toContainText(
      'Check the customer, invoices and amount, then confirm.',
    );
    await expect(page.locator('app-person-card', { hasText: customer }).first()).toBeVisible();
    await expect(page.locator('app-text-field input').first()).toHaveValue('50.00');
    await page.getByRole('button', { name: 'Review payment' }).click();
    await expect(page).toHaveURL(/\/money\/receive\/review$/);
    await page.getByRole('button', { name: /^Confirm receipt/ }).click();
    await expect(page).toHaveURL(/\/money\/receive\/recorded$/, { timeout: 60_000 });
    await expectHeading(page, 'Collection recorded');

    const payments = await erp(page).list<{ name: string; paid_amount: number }>(
      'Payment Entry',
      ['name', 'paid_amount'],
      [
        ['party', '=', made.name],
        ['docstatus', '=', 1],
      ],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].paid_amount).toBe(50);
    payment = payments[0].name;
    const posted = await erp(page).doc<{ outstanding_amount: number }>(
      'Sales Invoice',
      invoice.name,
    );
    expect(posted.outstanding_amount).toBe(61);
  } finally {
    if (payment) {
      await post(page, 'frappe.client.cancel', { doctype: 'Payment Entry', name: payment });
    }
    await post(page, 'frappe.client.cancel', { doctype: 'Sales Invoice', name: invoice.name });
  }
});

test('proposes a stock move, opens it filled in, and posts it @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await topUp(page, OLIVE.code, MAIN, 5);
  await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_stock_move', {
        item: 'Olive tree',
        qty: 1,
        from: MAIN,
        to: GARDEN,
      }),
    }),
    () => ({ body: answer('I prepared the move. Review it and confirm.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, 'Move one olive tree to the garden shop');
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  await expect(card(page)).toContainText(named('Stock move:', OLIVE.name));
  await expect(card(page)).toContainText(named('1', '×', OLIVE.name));
  await expect(card(page)).toContainText(named(MAIN, '→', GARDEN));
  await card(page).getByRole('button', { name: 'Review stock move' }).click();

  await expect(page).toHaveURL(/\/inventory\/transfer\?prefill=/);
  await expectHeading(page, 'Move stock');
  await expect(notice(page, 'Filled in by the assistant')).toContainText(
    'Check the item, locations and quantity, then confirm.',
  );
  await expect(page.locator('app-item-card', { hasText: OLIVE.name })).toBeVisible();
  const selects = page.locator('app-select-field select');
  await expect(selects.nth(0).locator('option:checked')).toContainText(MAIN);
  await expect(selects.nth(1).locator('option:checked')).toContainText(GARDEN);
  await expect(page.locator('app-text-field input').first()).toHaveValue('1');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await expect(page).toHaveURL(/\/inventory\/transfer\/done$/, { timeout: 60_000 });
  const [entry] = await erp(page).list<{ name: string; remarks: string }>(
    'Stock Entry',
    ['name', 'remarks'],
    [
      ['docstatus', '=', 1],
      ['purpose', '=', 'Material Transfer'],
    ],
    { order_by: 'creation desc', limit_page_length: 1 },
  );
  const doc = await erp(page).doc<{
    items: { item_code: string; qty: number; s_warehouse: string; t_warehouse: string }[];
  }>('Stock Entry', entry.name);
  expect(doc.items.map((i) => [i.item_code, i.qty])).toEqual([[OLIVE.code, 1]]);
  expect(doc.items[0].s_warehouse).toContain('Main warehouse');
  expect(doc.items[0].t_warehouse).toContain(GARDEN);
});

test('opens a draft and a confirmed record from the chat, each on its own page @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const [company] = await erp(page).list<{ name: string }>('Company', ['name']);
  const [warehouse] = await erp(page).list<{ name: string }>(
    'Warehouse',
    ['name'],
    [['warehouse_name', '=', MAIN]],
  );
  const draft = await post<{ name: string }>(page, 'frappe.client.insert', {
    doc: {
      doctype: 'Sales Invoice',
      company: company.name,
      customer: CUSTOMER,
      update_stock: 1,
      set_warehouse: warehouse.name,
      remarks: `Madar quick sale SALE-${runId()}AB`,
      items: [{ item_code: ITEM.code, qty: 1, rate: 45, warehouse: warehouse.name }],
    },
  });
  const [confirmed] = await erp(page).list<{ name: string }>(
    'Sales Invoice',
    ['name'],
    [
      ['docstatus', '=', 1],
      ['is_return', '=', 0],
    ],
    { order_by: 'creation desc', limit_page_length: 1 },
  );
  try {
    const requests = await scriptAssistant(page, [
      () => ({ body: toolCall('t1', 'open_record', { kind: 'draft', name: draft.name }) }),
      () => ({ body: answer('Its page has Continue and Delete.') }),
      () => ({ body: toolCall('t2', 'open_record', { kind: 'invoice', name: confirmed.name }) }),
      () => ({ body: answer("A confirmed invoice can't be cancelled in Madar yet.") }),
    ]);
    await page.goto('/assistant');
    await ask(page, `Delete draft ${draft.name}`);
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    await expect(card(page)).toContainText(named('Draft', draft.name));
    await expect(card(page)).not.toContainText('Nothing is saved');
    expect(JSON.parse(lastResult(requests[1]).content)).toMatchObject({
      proposal_id: expect.stringMatching(/^PRP-/),
      summary: expect.stringContaining('Continue and Delete'),
    });
    await card(page).getByRole('button', { name: 'Open record' }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/invoices/${draft.name}$`));
    await expect(page.getByRole('button', { name: 'Continue sale' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete draft' })).toBeVisible();

    await page.goto('/assistant');
    await ask(page, `Cancel invoice ${confirmed.name}`);
    await expect(card(page)).toContainText(named('Invoice', confirmed.name));
    expect(JSON.parse(lastResult(requests[3]).content)['summary']).toContain(
      "cancelling or amending isn't available in Madar yet",
    );
    await card(page).getByRole('button', { name: 'Open record' }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/invoices/${confirmed.name}$`));
  } finally {
    await page.request.post('/api/method/frappe.client.delete', {
      data: { doctype: 'Sales Invoice', name: draft.name },
    });
  }
});

test('a salesperson is offered no purchase order, and is refused one if asked @desktop', async ({
  page,
}) => {
  await signIn(page, 'salesperson');
  const requests = await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_purchase_order', {
        supplier: SUPPLIER,
        items: [{ item: ITEM.code, qty: 5 }],
      }),
    }),
    () => ({ body: answer("I can't prepare purchase orders for you.") }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Order 5 planters from ${SUPPLIER}`);
  await expect(bubbles(page, 'assistant')).toHaveText("I can't prepare purchase orders for you.", {
    timeout: 30_000,
  });
  expect(requests[0].tools).toEqual(
    expect.arrayContaining(['propose_quick_sale', 'propose_quotation', 'propose_collect_payment']),
  );
  expect(requests[0].tools).not.toContain('propose_purchase_order');
  expect(requests[0].tools).not.toContain('propose_stock_move');
  expect(lastResult(requests[1])).toMatchObject({
    content: 'not allowed for your role',
    is_error: true,
  });
  await expect(card(page)).toHaveCount(0);
});

test('a salesperson’s proposed price is ignored: the sale opens at the listed price @phone', async ({
  page,
}) => {
  await signIn(page, 'salesperson');
  const price = 45;
  const requests = await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_quick_sale', {
        customer: CUSTOMER,
        items: [{ item: 'Ceramic planter', qty: 2, rate: 10 }],
      }),
    }),
    () => ({ body: answer('I prepared the sale. Review it and confirm.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Sell 2 planters to ${CUSTOMER} at 10 each`);
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  const result = JSON.parse(lastResult(requests[1]).content) as { notes: string[] };
  expect(result.notes).toEqual([
    `${ITEM.name}: the proposed price was ignored; your role can't set prices.`,
  ]);
  await expect(card(page)).not.toContainText(ils(20));
  await card(page).getByRole('button', { name: 'Review sale' }).click();
  await expect(page).toHaveURL(/\/sales\/new\/basket\?prefill=/);
  await expect(notice(page, 'Filled in by the assistant')).toBeVisible();
  const detail = page.locator('app-item-card', { hasText: ITEM.name });
  await expect(detail).not.toContainText(ils(10));
  await expect(detail).toContainText(named('2', '×', price.toFixed(2)));
});

test('shows the proposal in Arabic, and opens the task in Arabic with its notice @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await topUp(page, OLIVE.code, MAIN, 5);
  const price = await listPrice(page, OLIVE.code);
  await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_quick_sale', {
        customer: CUSTOMER,
        items: [{ item: OLIVE.code, qty: 2 }],
      }),
    }),
    () => ({ body: answer('جهّزت عملية البيع. راجعها ثم أكّدها.') }),
  ]);
  await page.goto('/assistant');
  await toArabic(page);
  await ask(page, 'بع شجرتي زيتون إلى لينا');
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  await expect(card(page)).toContainText(named('بيع إلى', CUSTOMER));
  await expect(card(page)).toContainText(named('2', '×', OLIVE.name, '—', ils(2 * price)));
  await expect(card(page)).toContainText(named('الإجمالي', ils(2 * price)));
  await expect(card(page)).toContainText('لا يُحفظ شيء حتى تؤكّد.');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await card(page).getByRole('button', { name: 'مراجعة البيع' }).click();

  await expect(page).toHaveURL(/\/sales\/new\/basket\?prefill=/);
  await expect(notice(page, 'عبّأه المساعد')).toContainText(
    'راجع الأصناف والأسعار والعميل، ثم أكّد.',
  );
  await expect(page.locator('app-item-card', { hasText: OLIVE.name })).toBeVisible();
});

test('says the proposal has expired, and opens the task normally, when it is gone @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const routes: [string, RegExp][] = [
    ['/sales/new/basket?prefill=PF-GONE', /^New sale$/],
    ['/sales/quote/new?prefill=PF-GONE', /^New quotation$/],
    ['/purchases/new?prefill=PF-GONE', /^New purchase order$/],
    ['/money/receive?prefill=PF-GONE', /^Receive customer payment$/],
    ['/inventory/transfer?prefill=PF-GONE', /^Move stock$/],
  ];
  for (const [route, title] of routes) {
    await page.goto(route);
    await expectHeading(page, title);
    const expired = notice(page, 'This proposal has expired.');
    await expect(expired).toContainText('Ask the assistant again.');
    await expect(notice(page, 'Filled in by the assistant')).toHaveCount(0);
  }
  // Nothing was filled in: the sale has no customer and no lines.
  await page.goto('/sales/new/basket?prefill=PF-GONE');
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expect(page.locator('app-search-field input')).toHaveValue('');
});

test('says the proposal has expired in Arabic @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/purchases/new?prefill=PF-GONE');
  await toArabic(page);
  await expect(notice(page, 'انتهت صلاحية هذا الاقتراح.')).toContainText(
    'اطلب من المساعد مرة أخرى.',
  );
});

test('a proposal is handed over once: opening the task again does not refill it @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_quotation', {
        customer: CUSTOMER,
        items: [{ item: ITEM.code, qty: 1 }],
      }),
    }),
    () => ({ body: answer('Review it.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Quote a planter for ${CUSTOMER}`);
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  await card(page).getByRole('button', { name: 'Review quotation' }).click();
  await expect(page).toHaveURL(/\/sales\/quote\/new\?prefill=/);
  const address = page.url();
  await expect(notice(page, 'Filled in by the assistant')).toBeVisible();

  // The same address after a reload is a proposal that is gone: the app holds it in memory only.
  await page.goto(address);
  await expect(notice(page, 'This proposal has expired.')).toBeVisible();
  await expect(page.locator('app-item-card', { hasText: ITEM.name })).toHaveCount(0);
});
