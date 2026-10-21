import { Page, expect, test } from '@playwright/test';
import {
  CUSTOMER,
  ITEM,
  MAIN,
  SUPPLIER,
  erp,
  expectHeading,
  named,
  plain,
  runId,
  signIn,
  toArabic,
} from './support';

type Doc = Record<string, unknown>;

async function company(page: Page) {
  const [row] = await erp(page).list<{ name: string }>('Company', ['name']);
  return row.name;
}

async function insert(page: Page, doc: Doc): Promise<string> {
  const response = await page.request.post('/api/method/frappe.client.insert', { data: { doc } });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: { name: string } }).message.name;
}

async function saleDraft(page: Page): Promise<string> {
  const [warehouse] = await erp(page).list<{ name: string }>(
    'Warehouse',
    ['name'],
    [['warehouse_name', '=', MAIN]],
  );
  return insert(page, {
    doctype: 'Sales Invoice',
    company: await company(page),
    customer: CUSTOMER,
    update_stock: 1,
    set_warehouse: warehouse.name,
    remarks: `Madar quick sale SALE-${runId()}AB`,
    items: [{ item_code: ITEM.code, qty: 1, rate: 45, warehouse: warehouse.name }],
  });
}

const quotationDraft = async (page: Page) =>
  insert(page, {
    doctype: 'Quotation',
    company: await company(page),
    quotation_to: 'Customer',
    party_name: CUSTOMER,
    utm_content: `QUO-${runId()}CD`,
    items: [{ item_code: ITEM.code, qty: 2, rate: 45 }],
  });

async function purchaseDraft(page: Page): Promise<string> {
  const date = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  return insert(page, {
    doctype: 'Purchase Order',
    company: await company(page),
    supplier: SUPPLIER,
    schedule_date: date,
    order_confirmation_no: `PUR-${runId()}EF`,
    items: [{ item_code: ITEM.code, qty: 3, rate: 20, schedule_date: date }],
  });
}

async function remove(page: Page, doctype: string, name: string) {
  await page.request.post('/api/method/frappe.client.delete', { data: { doctype, name } });
}

const exists = async (page: Page, doctype: string, name: string) =>
  (await erp(page).list<{ name: string }>(doctype, ['name'], [['name', '=', name]])).length === 1;

async function draftCard(page: Page, name: string) {
  await page.goto('/drafts');
  await expectHeading(page, /Unfinished work|أعمال غير مكتملة/);
  await page.locator('app-search-field input').fill(name);
  return page.locator('app-drafts-list app-feedback-card');
}

test('owner deletes a sale draft from Unfinished work, after a confirmation @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const draft = await saleDraft(page);
  try {
    const card = await draftCard(page, draft);
    await expect(card).toHaveCount(1);
    await expect(page.locator('app-page-heading p')).toContainText(named('1', 'draft'));

    await card.getByRole('button', { name: 'Delete draft' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Delete this draft?' })).toBeVisible();
    await expect(dialog).toContainText(
      named('Sale for', CUSTOMER, "will be deleted. This can't be undone."),
    );
    await dialog.getByRole('button', { name: 'Keep' }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toHaveCount(1);
    expect(await exists(page, 'Sales Invoice', draft)).toBe(true);

    await card.getByRole('button', { name: 'Delete draft' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('No matching drafts')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete draft' })).toHaveCount(0);
    await expect(page.getByText('Draft deleted')).toBeVisible();
    await expect(page.getByText(named('Sale for', CUSTOMER, 'was deleted.'))).toBeVisible();
    await expect(page.locator('app-page-heading p')).toContainText(named('0', 'drafts'));
    await expect(page.getByText('No matching drafts')).toBeVisible();
    expect(await exists(page, 'Sales Invoice', draft)).toBe(false);
  } finally {
    await remove(page, 'Sales Invoice', draft);
  }
});

test('owner deletes a purchase order draft from its own page @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  const draft = await purchaseDraft(page);
  try {
    await page.goto(`/purchases/order/${draft}`);
    await page.getByRole('button', { name: 'Delete draft' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(
      named('Purchase from', SUPPLIER, "will be deleted. This can't be undone."),
    );
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page).toHaveURL(/\/drafts$/);
    await expectHeading(page, 'Unfinished work');
    await expect(page.getByText('Draft deleted')).toBeVisible();
    await expect(page.getByText(named('Purchase from', SUPPLIER, 'was deleted.'))).toBeVisible();
    await expect(page.locator('app-drafts-list')).not.toContainText(draft);
    expect(await exists(page, 'Purchase Order', draft)).toBe(false);
  } finally {
    await remove(page, 'Purchase Order', draft);
  }
});

test('the salesperson can delete her own quotation draft but not a sale draft or a colleague’s @phone', async ({
  page,
}) => {
  await signIn(page, 'salesperson');
  const own = await quotationDraft(page);
  const sale = await saleDraft(page);
  try {
    // ERPNext lets Sales User delete quotations but only Accounts Manager delete sales invoices.
    const quote = await draftCard(page, own);
    await expect(quote).toHaveCount(1);
    await expect(quote.getByRole('button', { name: 'Delete draft' })).toBeVisible();
    const invoice = await draftCard(page, sale);
    await expect(invoice).toHaveCount(1);
    await expect(invoice.getByRole('button', { name: 'Delete draft' })).toHaveCount(0);
    await page.goto(`/sales/invoices/${sale}`);
    await expect(page.getByRole('button', { name: 'Continue sale' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete draft' })).toHaveCount(0);

    await page.goto(`/sales/quotes/${own}`);
    await page.getByRole('button', { name: 'Delete draft' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/drafts$/);
    await expect(page.getByText('Draft deleted')).toBeVisible();
    expect(await exists(page, 'Quotation', own)).toBe(false);
  } finally {
    await remove(page, 'Quotation', own);
    await remove(page, 'Sales Invoice', sale);
  }
});

test('the salesperson sees no Delete on a colleague’s quotation draft @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const theirs = await quotationDraft(page);
  try {
    await page.context().clearCookies();
    await signIn(page, 'salesperson');
    await page.goto(`/sales/quotes/${theirs}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to sales' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete draft' })).toHaveCount(0);
  } finally {
    await page.context().clearCookies();
    await signIn(page, 'owner');
    await remove(page, 'Quotation', theirs);
  }
});

test('the confirmation reads in Arabic, and Keep leaves the draft @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const draft = await quotationDraft(page);
  try {
    const card = await draftCard(page, draft);
    await toArabic(page);
    await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: 'حذف المسودة' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'حذف هذه المسودة؟' })).toBeVisible();
    expect(plain((await dialog.locator('p').innerText()).replace(/[⁦-⁩]/g, ''))).toBe(
      `سيتم حذف عرض سعر إلى ${CUSTOMER}. لا يمكن التراجع عن ذلك.`,
    );
    await expect(dialog.getByRole('button', { name: 'حذف', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'إبقاء' }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toHaveCount(1);
    expect(await exists(page, 'Quotation', draft)).toBe(true);
  } finally {
    await remove(page, 'Quotation', draft);
  }
});
