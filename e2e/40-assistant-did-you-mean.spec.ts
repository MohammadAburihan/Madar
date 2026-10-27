import { Page, expect, test } from '@playwright/test';
import { answer, ask, bubbles, scriptAssistant, toolCall } from './assistant-support';
import type { ChatBody } from './assistant-support';
import { CUSTOMER, choose, erp, expectHeading, named, runId, signIn, toArabic } from './support';

/** Letters only and unlike any earlier run's name, so an old record is never a close match to a new one. */
const unique = () =>
  Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(
    '',
  );

const card = (page: Page) => page.locator('app-assistant-proposal');
const choices = (page: Page) => page.locator('app-assistant-choices button');
const notice = (page: Page, title: string) => page.locator('app-feedback-card', { hasText: title });

/** The result the page sent back for the last tool call, as the assistant would read it. */
function lastResult(body: ChatBody): { content: string; is_error?: boolean } {
  const [result] = body.messages.at(-1)!.content as { content: string; is_error?: boolean }[];
  return result;
}

async function insertCustomer(page: Page, name: string): Promise<void> {
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: { doc: { doctype: 'Customer', customer_name: name, customer_type: 'Individual' } },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

const customersNamed = (page: Page, name: string) =>
  erp(page).list<{ name: string; mobile_no: string | null; email_id: string | null }>(
    'Customer',
    ['name', 'mobile_no', 'email_id'],
    [['customer_name', '=', name]],
  );

const sale = (customer: string) => ({
  customer,
  items: [{ item: 'Olive tree', qty: 1 }],
});

async function insertItem(page: Page, code: string, name: string): Promise<void> {
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Item',
        item_code: code,
        item_name: name,
        item_group: 'Services',
        stock_uom: 'Unit',
        is_stock_item: 0,
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

const forItem = (item: string) => ({ customer: CUSTOMER, items: [{ item, qty: 1 }] });

test('finds an Arabic item typed with long vowels and number words, with no add-as-new @phone @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const id = unique();
  const stored = `برش 7 لتر ${id}`;
  await insertItem(page, `E2E-BRS-${id}`, stored);
  const requests = await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_quick_sale', forItem(`بروش سبعة لتر ${id}`)) }),
    () => ({ body: answer('هل تقصد هذا الصنف؟') }),
    () => ({ body: toolCall('t2', 'propose_quick_sale', forItem(stored)) }),
    () => ({ body: answer('جهّزت البيع. راجعه ثم أكّده.') }),
  ]);
  await page.goto('/assistant');
  await toArabic(page);
  await ask(page, `بيع بروش سبعة لتر ${id}`);

  await expect(choices(page).filter({ hasText: stored })).toHaveCount(1, { timeout: 30_000 });
  await expect(choices(page)).toHaveCount(2);
  await expect(choices(page).last()).toHaveText('لا أحد منهم');
  await expect(page.locator('app-assistant-choices').getByText('كجديد')).toHaveCount(0);
  expect(JSON.parse(lastResult(requests[1]).content)).toMatchObject({
    did_you_mean: true,
    field: 'item',
    can_create: false,
    options: [{ label: stored }],
  });

  await choices(page).filter({ hasText: stored }).click();
  expect(requests[2].messages.at(-1)).toEqual({ role: 'user', content: stored });
  await expect(card(page)).toContainText(named('بيع إلى', CUSTOMER), { timeout: 30_000 });
});

test('offers the near item and add-as-new when the name is only close, and add-as-new proposes it @phone @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const id = unique();
  await insertItem(page, `E2E-BRS-${id}`, `برش 7 لتر ${id}`);
  const typed = `بروش ثمانية لترر ${id}`;
  const label = `Add “${typed}” as new`;
  const requests = await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_quick_sale', forItem(typed)) }),
    () => ({ body: answer('Did you mean this item, or should I add a new one?') }),
    () => ({ body: toolCall('t2', 'propose_new_item', { name: typed, kind: 'product' }) }),
    () => ({ body: answer('I prepared a new item. Review it and save it.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Sell ${typed}`);

  await expect(choices(page)).toHaveCount(3, { timeout: 30_000 });
  await expect(choices(page).nth(0)).toContainText(`برش 7 لتر ${id}`);
  await expect(choices(page).nth(1)).toHaveText(label);
  await expect(choices(page).nth(2)).toHaveText('None of these');
  expect(JSON.parse(lastResult(requests[1]).content)).toMatchObject({
    did_you_mean: true,
    can_create: true,
  });

  await choices(page).nth(1).click();
  await expect(bubbles(page, 'user').last()).toHaveText(label);
  expect(requests[2].messages.at(-1)).toEqual({ role: 'user', content: label });
  await expect(card(page)).toContainText(named('New item:', typed), { timeout: 30_000 });
  await expect(choices(page)).toHaveCount(0);
});

test('offers add-as-new as a button when nothing is close @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const name = `${unique()} Odeh`;
  await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_collect_payment', { customer: name }) }),
    () => ({ body: answer('I could not find that customer. Add it as new?') }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Collect a payment from ${name}`);
  await expect(choices(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(choices(page)).toHaveText(`Add “${name}” as new`);
});

test('suggests the customer a typo meant and carries on with the one picked @phone @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const requests = await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_quick_sale', sale('Leena Haddad')) }),
    () => ({ body: answer('I could not find Leena Haddad. Did you mean one of these?') }),
    () => ({ body: toolCall('t2', 'propose_quick_sale', sale(CUSTOMER)) }),
    () => ({ body: answer('I prepared the sale. Review it and confirm.') }),
  ]);
  await page.goto('/assistant');
  await expectHeading(page, 'Assistant');
  await ask(page, 'Sell an olive tree to Leena Haddad');

  await expect(choices(page).first()).toBeVisible({ timeout: 30_000 });
  await expect(choices(page).filter({ hasText: CUSTOMER })).toHaveCount(1);
  await expect(choices(page).last()).toHaveText('None of these');
  await expect(card(page)).toHaveCount(0);
  const result = JSON.parse(lastResult(requests[1]).content) as {
    needs_choice: boolean;
    did_you_mean: boolean;
    field: string;
    query: string;
    options: { id: string; label: string }[];
  };
  expect(result).toMatchObject({
    needs_choice: true,
    did_you_mean: true,
    field: 'customer',
    query: 'Leena Haddad',
  });
  expect(result.options.map((o) => o.label)).toContain(CUSTOMER);
  expect(result.options.length).toBeLessThanOrEqual(5);

  await choices(page).filter({ hasText: CUSTOMER }).click();
  await expect(bubbles(page, 'user').last()).toHaveText(CUSTOMER);
  expect(requests[2].messages.at(-1)).toEqual({ role: 'user', content: CUSTOMER });
  await expect(card(page)).toContainText(named('Sale to', CUSTOMER), { timeout: 30_000 });
  await expect(choices(page)).toHaveCount(0);
});

test('sends "None of these" as the user’s answer @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const requests = await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_quick_sale', sale('Leena Haddad')) }),
    () => ({ body: answer('Did you mean Lina Haddad?') }),
    () => ({ body: answer('Then tell me the new customer’s name.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, 'Sell an olive tree to Leena Haddad');
  await choices(page).last().click();
  await expect(bubbles(page, 'user').last()).toHaveText('None of these');
  expect(requests[2].messages.at(-1)).toEqual({ role: 'user', content: 'None of these' });
  await expect(bubbles(page, 'assistant').last()).toContainText('new customer');
  await expect(choices(page)).toHaveCount(0);
});

test('finds an Arabic customer typed with other letter forms @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const id = unique();
  const school = `مدرسة النور ${id}`;
  const ahmad = `أحمد الخطيب ${id}`;
  await insertCustomer(page, school);
  await insertCustomer(page, ahmad);
  await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_quick_sale', sale(`مدرسه النور ${id}`)) }),
    () => ({ body: answer('هل تقصد أحد هؤلاء؟') }),
    () => ({ body: toolCall('t2', 'propose_quick_sale', sale(`احمد الخطيب ${id}`)) }),
    () => ({ body: answer('هل تقصد أحد هؤلاء؟') }),
  ]);
  await page.goto('/assistant');
  await toArabic(page);
  await ask(page, `بيع شجرة زيتون إلى مدرسه النور ${id}`);

  await expect(choices(page).filter({ hasText: school })).toHaveCount(1, { timeout: 30_000 });
  await expect(choices(page).last()).toHaveText('لا أحد منهم');
  await choices(page).filter({ hasText: school }).click();
  await expect(bubbles(page, 'user').last()).toContainText(school);

  await ask(page, `بيع شجرة زيتون إلى احمد الخطيب ${id}`);
  await expect(choices(page).filter({ hasText: ahmad })).toHaveCount(1, { timeout: 30_000 });
  await expect(choices(page).last()).toHaveText('لا أحد منهم');
});

test('offers a new customer when nothing is close, and the form saves it as usual @phone @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const name = `${unique()} Odeh`;
  const requests = await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_collect_payment', { customer: name }) }),
    () => ({ body: toolCall('t2', 'propose_new_customer', { name, phone: '0599 123 456' }) }),
    () => ({
      body: answer('I prepared a new customer. Review it and save it, then ask me again.'),
    }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Collect a payment from ${name}`);

  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  const missing = JSON.parse(lastResult(requests[1]).content) as Record<string, unknown>;
  expect(missing).toMatchObject({
    not_found: true,
    field: 'customer',
    query: name,
    can_create: true,
  });
  expect(lastResult(requests[1]).is_error).toBe(true);
  await expect(card(page)).toContainText(named('New customer:', name));
  await expect(card(page)).toContainText('Nothing is saved until you confirm.');
  expect(await customersNamed(page, name)).toHaveLength(0);

  await card(page).getByRole('button', { name: 'Review new customer' }).click();
  await expect(page).toHaveURL(/\/contacts\/new\?.*prefill=/);
  await expectHeading(page, 'Add contact');
  await expect(page.getByLabel('Name *')).toHaveValue(name);
  await expect(page.getByLabel('Phone')).toHaveValue('0599 123 456');
  await expect(notice(page, 'Filled in by the assistant')).toContainText(
    'Check the details, then save.',
  );
  expect(await customersNamed(page, name)).toHaveLength(0);

  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/, { timeout: 30_000 });
  await expectHeading(page, name);
  const [saved] = await customersNamed(page, name);
  expect(saved).toBeTruthy();
  expect(saved.mobile_no).toBe('0599 123 456');
});

test('offers a new supplier, and the form saves it as a supplier @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  const name = `${unique()} Clay Works`;
  const requests = await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_purchase_order', {
        supplier: name,
        items: [{ item: 'Ceramic planter', qty: 1 }],
      }),
    }),
    () => ({ body: toolCall('t2', 'propose_new_supplier', { name }) }),
    () => ({ body: answer('I prepared a new supplier. Review it and save it.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Order a planter from ${name}`);
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
  expect(JSON.parse(lastResult(requests[1]).content)).toMatchObject({
    not_found: true,
    field: 'supplier',
    can_create: true,
  });
  await expect(card(page)).toContainText(named('New supplier:', name));
  await card(page).getByRole('button', { name: 'Review new supplier' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue(name);
  await expect(page.getByLabel('Contact type')).toHaveValue(/suppliers/);
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page).toHaveURL(/\/contacts\/suppliers\/[^/]+$/, { timeout: 30_000 });
  await expectHeading(page, name);
});

test('offers a new item, and the item form saves it with the owner’s price @phone @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const id = runId();
  const name = `${unique()} fig tree`;
  const code = `E2E-FIG-${id}`;
  await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_new_item', { name, kind: 'product', selling_price: 45 }),
    }),
    () => ({ body: answer('I prepared a new item. Review it and save it.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, `Add a new item called ${name} at 45`);

  await expect(card(page)).toContainText(named('New item:', name), { timeout: 30_000 });
  await expect(card(page)).toContainText('Nothing is saved until you confirm.');
  await card(page).getByRole('button', { name: 'Review new item' }).click();
  await expect(page).toHaveURL(/\/catalog\/new\?.*prefill=/);
  await expectHeading(page, 'Add item or service');
  const fields = page.locator('app-text-field input');
  await expect(fields.nth(0)).toHaveValue(name);
  await expect(
    page.locator('app-text-field', { hasText: 'Selling price' }).locator('input'),
  ).toHaveValue('45');
  await expect(notice(page, 'Filled in by the assistant')).toContainText(
    'Check the details, then save.',
  );
  expect(await erp(page).list('Item', ['name'], [['item_name', '=', name]])).toHaveLength(0);

  await fields.nth(1).fill(code);
  const selects = page.locator('app-select-field select');
  await choose(selects.nth(1), 'Products');
  await choose(selects.nth(2), 'Unit');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(new RegExp(`/catalog/${code}$`), { timeout: 60_000 });
  await expectHeading(page, name);
  const item = await erp(page).doc<{ item_name: string }>('Item', code);
  expect(item.item_name).toBe(name);
  const [price] = await erp(page).list<{ price_list_rate: number }>(
    'Item Price',
    ['price_list_rate'],
    [['item_code', '=', code]],
  );
  expect(price.price_list_rate).toBe(45);
});

test('a salesperson can add customers but is never offered a new item @phone', async ({ page }) => {
  await signIn(page, 'salesperson');
  const requests = await scriptAssistant(page, [
    () => ({
      body: toolCall('t1', 'propose_quick_sale', {
        customer: 'walk-in',
        items: [{ item: `Zed Quartz ${runId()}`, qty: 1 }],
      }),
    }),
    () => ({ body: toolCall('t2', 'propose_new_item', { name: 'Fig tree', kind: 'product' }) }),
    () => ({ body: answer('I cannot add items for your role.') }),
  ]);
  await page.goto('/assistant');
  await ask(page, 'Sell a zed quartz');
  await expect(bubbles(page, 'assistant').last()).toContainText('cannot add items', {
    timeout: 30_000,
  });
  expect(requests[0].tools).toContain('propose_new_customer');
  expect(requests[0].tools).not.toContain('propose_new_item');
  expect(requests[0].tools).not.toContain('propose_new_supplier');
  expect(JSON.parse(lastResult(requests[1]).content)).toMatchObject({
    not_found: true,
    field: 'item',
    can_create: false,
  });
  expect(lastResult(requests[2])).toMatchObject({
    content: 'not allowed for your role',
    is_error: true,
  });
  await expect(card(page)).toHaveCount(0);
});

test('shows the new-customer card and the filled-in form in Arabic @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const name = `سامر ${unique()}`;
  await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_new_customer', { name }) }),
    () => ({ body: answer('جهّزت عميلاً جديداً. راجعه ثم احفظه.') }),
  ]);
  await page.goto('/assistant');
  await toArabic(page);
  await ask(page, `أضف عميلاً جديداً اسمه ${name}`);

  await expect(card(page)).toContainText(named('عميل جديد:', name), { timeout: 30_000 });
  await expect(card(page)).toContainText('لا يُحفظ شيء حتى تؤكّد.');
  await card(page).getByRole('button', { name: 'مراجعة العميل الجديد' }).click();
  await expect(page).toHaveURL(/\/contacts\/new\?.*prefill=/);
  await expect(notice(page, 'عبّأه المساعد')).toContainText('راجع التفاصيل ثم احفظ.');
  await expect(page.locator('app-text-field input').first()).toHaveValue(name);
  expect(await customersNamed(page, name)).toHaveLength(0);
});

test('shows the new supplier and item cards in Arabic @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await scriptAssistant(page, [
    () => ({ body: toolCall('t1', 'propose_new_supplier', { name: 'مصنع الفخار' }) }),
    () => ({ body: answer('جهّزت مورّداً جديداً.') }),
    () => ({ body: toolCall('t2', 'propose_new_item', { name: 'شجرة تين', kind: 'product' }) }),
    () => ({ body: answer('جهّزت صنفاً جديداً.') }),
  ]);
  await page.goto('/assistant');
  await toArabic(page);
  await ask(page, 'أضف مورّداً جديداً');
  await expect(card(page).first()).toContainText(named('مورّد جديد:', 'مصنع الفخار'), {
    timeout: 30_000,
  });
  await expect(
    card(page).first().getByRole('button', { name: 'مراجعة المورّد الجديد' }),
  ).toBeVisible();
  await ask(page, 'أضف صنفاً جديداً');
  await expect(card(page).last()).toContainText(named('صنف جديد:', 'شجرة تين'), {
    timeout: 30_000,
  });
  await expect(
    card(page).last().getByRole('button', { name: 'مراجعة الصنف الجديد' }),
  ).toBeVisible();
});
