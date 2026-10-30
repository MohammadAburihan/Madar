import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, heading, ils, named, plain, runId, signIn, toArabic } from './support';

async function party(page: Page, doctype: 'Customer' | 'Supplier', name: string): Promise<string> {
  const doc =
    doctype === 'Customer'
      ? { doctype, customer_name: name, customer_type: 'Individual' }
      : { doctype, supplier_name: name, supplier_type: 'Company' };
  const response = await page.request.post('/api/method/frappe.client.insert', { data: { doc } });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: { name: string } }).message.name;
}

interface Invoice {
  name: string;
  docstatus: number;
  is_opening: string;
  grand_total: number;
  outstanding_amount: number;
  posting_date: string;
  due_date: string;
  remarks: string;
  update_stock: number;
  items: { item_code?: string | null; income_account?: string; expense_account?: string }[];
}

async function openingInvoice(
  page: Page,
  doctype: 'Sales Invoice' | 'Purchase Invoice',
  field: 'customer' | 'supplier',
  party: string,
): Promise<Invoice> {
  const [row] = await erp(page).list<{ name: string }>(doctype, ['name'], [[field, '=', party]]);
  expect(row, `an ${doctype} for ${party}`).toBeTruthy();
  return erp(page).doc<Invoice>(doctype, row.name);
}

const contact = (kind: 'customers' | 'suppliers', id: string) =>
  `/contacts/${kind}/${encodeURIComponent(id)}`;

test.describe.serial('opening balance for a customer @phone', () => {
  const name = `E2E Opening Customer ${runId()}`;
  let id = '';
  let invoice = '';

  test('records what the customer owed before Madar, as an opening invoice', async ({ page }) => {
    await signIn(page, 'owner');
    id = await party(page, 'Customer', name);
    await page.goto(contact('customers', id));
    await expectHeading(page, name);
    await page.getByRole('button', { name: 'Opening balance' }).click();
    await expect(page).toHaveURL(/\/opening-balance$/);
    await expectHeading(page, 'Opening balance');
    await expect(page.locator('app-page-heading')).toContainText(named(name, '· They owe us'));
    await expect(page.getByText('not a sale, so sales and profit')).toBeVisible();

    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByText('Enter an amount above 0')).toBeVisible();
    await page.getByLabel('Amount *').fill('1234.50');
    await page.getByLabel('Date *').fill('2026-01-15');
    await page.getByLabel('Note (optional)').fill('Garden job from 2025');
    await page.getByRole('button', { name: 'Review' }).click();

    await expectHeading(page, 'Review opening balance');
    await expect(page.locator('app-feedback-card')).toContainText(
      named(name, 'owes you', 'ILS 1,234.50'),
    );
    const rows = page.locator('app-totals-card');
    await expect(rows).toContainText('They owe us');
    await expect(rows).toContainText('15 Jan 2026');
    await expect(rows).toContainText('Garden job from 2025');
    await page.getByRole('button', { name: 'Record opening balance' }).click();

    await expect(heading(page)).toHaveText('Opening balance recorded', { timeout: 60_000 });
    await expect(page.locator('app-feedback-card')).toContainText(
      named('ILS 1,234.50', 'opening balance'),
    );
    const doc = await openingInvoice(page, 'Sales Invoice', 'customer', id);
    invoice = doc.name;
    expect(doc).toMatchObject({
      docstatus: 1,
      is_opening: 'Yes',
      grand_total: 1234.5,
      outstanding_amount: 1234.5,
      posting_date: '2026-01-15',
      due_date: '2026-01-15',
      update_stock: 0,
    });
    expect(doc.remarks).toMatch(/^Garden job from 2025\n\nMadar opening balance OPN-[0-9A-Z]{7}$/);
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0].item_code).toBeFalsy();
    expect(doc.items[0].income_account).toMatch(/^Temporary Opening/);
  });

  test('opens the invoice, marked as an opening balance and not returnable', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/sales/invoices/${invoice}`);
    await expectHeading(page, named('Sales invoice', invoice));
    await expect(page.locator('app-status-chip', { hasText: 'Opening balance' })).toBeVisible();
    await expect(page.locator('app-totals-card')).toContainText(ils(1234.5));
    await expect(page.getByRole('button', { name: /Take back/ })).toHaveCount(0);
  });

  test('shows in what the customer owes, is not their latest sale, and can be collected', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(contact('customers', id));
    await expectHeading(page, name);
    await expect(page.locator('app-totals-card')).toContainText(ils(1234.5));
    await expect(page.locator('app-feedback-card', { hasText: 'Latest sale' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Receive payment' }).click();
    await expectHeading(page, 'Receive customer payment');
    await expect(page.getByText('Loading unpaid invoices…')).toHaveCount(0);
    await expect(page.getByText(invoice)).toBeVisible();
    await page.getByRole('button', { name: 'Review payment' }).click();
    await page.getByRole('button', { name: /^Confirm receipt/ }).click();
    await expect(page).toHaveURL(/\/money\/receive\/recorded$/, { timeout: 60_000 });
    await expectHeading(page, 'Collection recorded');
    const settled = await erp(page).doc<Invoice>('Sales Invoice', invoice);
    expect(settled.outstanding_amount).toBe(0);
  });
});

test('records a supplier opening balance, then pays it @desktop', async ({ page }) => {
  const name = `E2E Opening Supplier ${runId()}`;
  await signIn(page, 'owner');
  const id = await party(page, 'Supplier', name);
  await page.goto('/contacts?kind=suppliers');
  await page.locator('app-search-field input').fill(name);
  await page.getByRole('row', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: 'Opening balance' }).click();
  await expect(page).toHaveURL(/\/opening-balance$/);
  await expect(page.locator('app-page-heading')).toContainText(named(name, '· We owe them'));
  await expect(page.getByText('not an expense, so profit')).toBeVisible();
  await page.getByLabel('Amount *').fill('500');
  await page.getByLabel('Date *').fill('2026-02-01');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.locator('app-feedback-card')).toContainText(
    named('You owe', name, 'ILS 500.00'),
  );
  await expect(page.locator('app-totals-card')).toContainText('We owe them');
  await page.getByRole('button', { name: 'Record opening balance' }).click();
  await expect(heading(page)).toHaveText('Opening balance recorded', { timeout: 60_000 });

  const doc = await openingInvoice(page, 'Purchase Invoice', 'supplier', id);
  expect(doc).toMatchObject({
    docstatus: 1,
    is_opening: 'Yes',
    grand_total: 500,
    outstanding_amount: 500,
    update_stock: 0,
  });
  expect(doc.remarks).toMatch(/Madar opening balance OPN-[0-9A-Z]{7}/);
  expect(doc.items[0].item_code).toBeFalsy();
  expect(doc.items[0].expense_account).toMatch(/^Temporary Opening/);

  await page.getByRole('button', { name: 'View invoice' }).click();
  await expect(page).toHaveURL(new RegExp(`/purchases/invoice/${doc.name}$`));
  await expect(page.locator('app-status-chip', { hasText: 'Opening balance' })).toBeVisible();
  await expect(page.locator('app-invoice-summary')).toContainText(ils(500));

  await page.goto(contact('suppliers', id));
  await expect(page.locator('app-feedback-card').first()).toContainText(ils(500));
  await page.getByRole('button', { name: /^Pay supplier$/ }).click();
  await expect(page.locator('app-select-field select').first()).toBeVisible();
  await page.getByRole('button', { name: /Confirm payment/ }).click();
  await expect(page).toHaveURL(/\/pay\/done$/, { timeout: 60_000 });
  await expect(page.locator('app-status-chip').first()).toHaveText('Paid in full');
  expect((await erp(page).doc<Invoice>('Purchase Invoice', doc.name)).outstanding_amount).toBe(0);
});

test('records an opening balance in Arabic, typing Arabic digits @phone', async ({ page }) => {
  const name = `E2E Opening Arabic ${runId()}`;
  await signIn(page, 'owner');
  const id = await party(page, 'Customer', name);
  await page.goto(contact('customers', id));
  await expectHeading(page, name);
  await toArabic(page);
  await page.getByRole('button', { name: 'الرصيد الافتتاحي' }).click();
  await expectHeading(page, 'الرصيد الافتتاحي');
  await expect(page.locator('app-page-heading')).toContainText('مستحق لنا');
  await page.getByLabel('المبلغ *').fill('٣٠٠٫٥');
  await page.getByLabel('ملاحظة · اختياري').fill('دين قديم');
  await page.getByRole('button', { name: 'مراجعة', exact: true }).click();
  await expectHeading(page, 'مراجعة الرصيد الافتتاحي');
  await expect(page.locator('app-totals-card')).toContainText('مستحق لنا');
  await expect(page.locator('app-totals-card')).toContainText('دين قديم');
  await page.getByRole('button', { name: 'تسجيل الرصيد الافتتاحي' }).click();
  await expect(heading(page)).toHaveText('تم تسجيل الرصيد الافتتاحي', { timeout: 60_000 });
  const doc = await openingInvoice(page, 'Sales Invoice', 'customer', id);
  expect(doc.grand_total).toBe(300.5);
  expect(doc.items[0].item_code).toBeFalsy();
  await page.getByRole('button', { name: 'عرض الفاتورة' }).click();
  await expect(page.locator('app-status-chip', { hasText: 'الرصيد الافتتاحي' })).toBeVisible();
  expect(plain(await page.locator('app-page-heading').innerText())).toContain(doc.name);
});

test('blocks an inactive customer with the reason @phone', async ({ page }) => {
  const name = `E2E Opening Inactive ${runId()}`;
  await signIn(page, 'owner');
  const id = await party(page, 'Customer', name);
  const disabled = await page.request.post('/api/method/frappe.client.set_value', {
    data: { doctype: 'Customer', name: id, fieldname: { disabled: 1 } },
  });
  expect(disabled.ok(), await disabled.text()).toBe(true);
  await page.goto(`${contact('customers', id)}/opening-balance`);
  await expect(page.locator('app-feedback-card')).toContainText('This contact is inactive');
  await expect(page.getByLabel('Amount *')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review' })).toHaveCount(0);
  const none = await erp(page).list('Sales Invoice', ['name'], [['customer', '=', id]]);
  expect(none).toHaveLength(0);
});

test('keeps opening balances to the owner @phone', async ({ page }) => {
  await signIn(page, 'salesperson');
  const [customer] = await erp(page).list<{ name: string }>(
    'Customer',
    ['name'],
    [['disabled', '=', 0]],
    { limit_page_length: 1 },
  );
  await page.goto(contact('customers', customer.name));
  await expect(page.getByRole('button', { name: /^Sell to/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Opening balance' })).toHaveCount(0);
  await page.goto(`${contact('customers', customer.name)}/opening-balance`);
  await expect(page.locator('app-feedback-card')).toContainText(
    "You can't record opening balances",
  );
  await expect(page.getByLabel('Amount *')).toHaveCount(0);
});

test('blocks the walk-in customer, and refuses extra decimals @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const [walkIn] = await erp(page).list<{ name: string }>(
    'Customer',
    ['name'],
    [['customer_name', '=', 'Walk-in Customer']],
  );
  await page.goto(`${contact('customers', walkIn.name)}/opening-balance`);
  await expect(page.locator('app-feedback-card')).toContainText(
    "The walk-in customer can't have an opening balance",
  );
  await expect(page.getByLabel('Amount *')).toHaveCount(0);

  const id = await party(page, 'Customer', `E2E Opening Decimals ${runId()}`);
  await page.goto(`${contact('customers', id)}/opening-balance`);
  await page.getByLabel('Amount *').fill('10.555');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText(named('Use at most', '2', 'decimals'))).toBeVisible();
  await expect(heading(page)).toHaveText('Opening balance');
});
