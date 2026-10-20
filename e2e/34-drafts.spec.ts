import { Page, expect, test } from '@playwright/test';
import {
  CUSTOMER,
  ITEM,
  MAIN,
  SUPPLIER,
  choose,
  erp,
  expectHeading,
  ils,
  named,
  runId,
  signIn,
  toArabic,
  topUp,
} from './support';

const lastDraft = async (page: Page, doctype: string, party: [string, string]) => {
  const [row] = await erp(page).list<{ name: string }>(
    doctype,
    ['name'],
    [
      ['docstatus', '=', 0],
      [party[0], '=', party[1]],
    ],
    { order_by: 'creation desc', limit_page_length: 1 },
  );
  expect(row, `a draft ${doctype}`).toBeTruthy();
  return row.name;
};

/** The card for one draft on Unfinished work, found by its document name through the search. */
async function draftCard(page: Page, name: string) {
  await page.goto('/drafts');
  await expectHeading(page, 'Unfinished work');
  await page.locator('app-search-field input').fill(name);
  const card = page.locator('app-drafts-list app-feedback-card');
  await expect(card).toHaveCount(1);
  return card;
}

async function addPlanterToSale(page: Page) {
  await choose(page.locator('app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page
    .getByRole('button', { name: named('Add', ITEM.name) })
    .first()
    .click();
  await page.getByRole('button', { name: /^Review basket/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/basket$/);
}

/** A draft quick sale as the quick-sale task saves it, made straight through ERPNext. */
async function insertSaleDraft(page: Page): Promise<string> {
  const api = erp(page);
  const [company] = await api.list<{ name: string }>('Company', ['name']);
  const [warehouse] = await api.list<{ name: string }>(
    'Warehouse',
    ['name'],
    [['warehouse_name', '=', MAIN]],
  );
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Sales Invoice',
        company: company.name,
        customer: CUSTOMER,
        update_stock: 1,
        set_warehouse: warehouse.name,
        remarks: `Madar quick sale SALE-${runId()}AB`,
        items: [{ item_code: ITEM.code, qty: 1, rate: 45, warehouse: warehouse.name }],
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: { name: string } }).message.name;
}

async function deleteDraft(page: Page, doctype: string, name: string) {
  await page.request.post('/api/method/frappe.client.delete', { data: { doctype, name } });
}

test('continues a sale draft from Unfinished work and posts the same invoice once @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await topUp(page, ITEM.code, MAIN, 5);
  await page.goto('/sales/new');
  await page.getByRole('button', { name: 'Walk-in customer' }).click();
  await addPlanterToSale(page);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
  const draft = await lastDraft(page, 'Sales Invoice', ['customer_name', 'Walk-in Customer']);
  const { remarks } = await erp(page).doc<{ remarks: string }>('Sales Invoice', draft);
  const reference = remarks.match(/SALE-[0-9A-Z]{7}/)![0];

  const card = await draftCard(page, draft);
  await expect(card).toContainText(named('Sale for', 'Walk-in Customer'));
  await expect(card).toContainText(named(ils(45), '·', '1 unit'));
  await expect(page.locator('app-page-heading p')).toContainText(named('1 draft', '·'));
  await expect(
    page.getByText('Drafts have no confirmed invoice, payment or stock effect.'),
  ).toBeVisible();
  await card.getByRole('button', { name: 'Continue sale' }).click();

  await expect(page).toHaveURL(/\/sales\/new\/basket\?draft=/);
  await expect(page.locator('app-item-card', { hasText: ITEM.name })).toBeVisible();
  await expect(page.locator('app-page-heading p').first()).toContainText('Walk-in customer');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: /^Confirm sale/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  await expectHeading(page, 'Sale confirmed');

  // The draft itself was posted: one invoice carries the sale's reference, and it is the draft.
  const posted = await erp(page).list<{ name: string; docstatus: number }>(
    'Sales Invoice',
    ['name', 'docstatus'],
    [['remarks', 'like', `%${reference}%`]],
  );
  expect(posted).toEqual([{ name: draft, docstatus: 1 }]);
});

test('continues a draft invoice from its page, on the desktop workspace @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await topUp(page, ITEM.code, MAIN, 5);
  await page.goto('/sales/new');
  await page.locator('app-search-field input').fill(CUSTOMER);
  await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
  await page.getByRole('button', { name: /^Continue with/ }).click();
  await choose(page.locator('section.panel app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page.locator('app-catalog-table button.row').filter({ hasText: ITEM.code }).first().click();
  await page.getByRole('button', { name: 'Review & payment' }).click();
  await expect(page).toHaveURL(/\/sales\/new\/review$/);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
  const draft = await lastDraft(page, 'Sales Invoice', ['customer_name', CUSTOMER]);

  await page.goto(`/sales/invoices/${draft}`);
  await page.getByRole('button', { name: 'Continue sale' }).click();
  await expect(page).toHaveURL(/\/sales\/new\/items\?draft=|\/sales\/new\/items$/);
  await expect(page.locator('section.panel')).toContainText(ITEM.name);
  await page.getByRole('button', { name: 'Review & payment' }).click();
  await page.getByRole('button', { name: /^Confirm sale/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  await expectHeading(page, 'Sale confirmed');
  await page.goto(`/sales/invoices/${draft}`);
  await expect(page.getByRole('button', { name: 'Continue sale' })).toHaveCount(0);
  await expect(page.locator('app-status-chip').first()).toContainText('Confirmed');
});

test.describe.serial('purchase order and supplier payment drafts @phone', () => {
  let order = '';
  let invoice = '';

  async function addPlanters(page: Page) {
    await page.locator('app-search-field input').fill(ITEM.code);
    await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
  }

  test('continues a purchase order draft from Unfinished work and confirms it once', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto('/purchases/new');
    await choose(page.locator('app-select-field select').first(), SUPPLIER);
    await addPlanters(page);
    await page.getByRole('button', { name: 'Review purchase order' }).click();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
    order = await lastDraft(page, 'Purchase Order', ['supplier', SUPPLIER]);
    const reference = (
      await erp(page).doc<{ order_confirmation_no: string }>('Purchase Order', order)
    ).order_confirmation_no;

    const card = await draftCard(page, order);
    await expect(card).toContainText(named('Purchase from', SUPPLIER));
    await expect(card).toContainText(named('1 unit', '·', 'Updated'));
    await card.getByRole('button', { name: 'Continue purchase' }).click();

    await expect(page).toHaveURL(/\/purchases\/new\?draft=/);
    await expect(page.getByLabel(named('Price each', '·', ITEM.name))).toHaveValue('20');
    await page.getByRole('button', { name: 'Review purchase order' }).click();
    await page.getByRole('button', { name: 'Confirm purchase order' }).click();
    await expect(page).toHaveURL(new RegExp(`/purchases/order/${order}$`), { timeout: 60_000 });

    const posted = await erp(page).list<{ name: string; docstatus: number }>(
      'Purchase Order',
      ['name', 'docstatus'],
      [['order_confirmation_no', '=', reference]],
    );
    expect(posted).toEqual([{ name: order, docstatus: 1 }]);
  });

  test('a purchase order draft can also be continued from its own page', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/purchases/new');
    await choose(page.locator('app-select-field select').first(), SUPPLIER);
    await addPlanters(page);
    await page.getByRole('button', { name: 'Review purchase order' }).click();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
    const draft = await lastDraft(page, 'Purchase Order', ['supplier', SUPPLIER]);

    await page.goto(`/purchases/order/${draft}`);
    await page.getByRole('button', { name: 'Continue purchase' }).click();
    await expect(page).toHaveURL(/\/purchases\/new\?draft=/);
    await expect(page.getByLabel(named('Price each', '·', ITEM.name))).toHaveValue('20');
    await deleteDraft(page, 'Purchase Order', draft);
  });

  test('receives the order and records its supplier invoice', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/purchases/order/${order}`);
    await page
      .getByRole('button', { name: /^Receive/ })
      .first()
      .click();
    await page.getByRole('button', { name: /Confirm receipt|Record .* received/ }).click();
    await expect(page).toHaveURL(/\/receive\/done$/, { timeout: 60_000 });
    await page.goto(`/purchases/order/${order}`);
    await page.getByRole('button', { name: 'Record supplier invoice' }).click();
    await page.locator('app-text-field input').first().fill(`GC-${runId()}`);
    await page.getByRole('button', { name: /^Record supplier invoice$/ }).click();
    await expect(page).toHaveURL(/\/invoice\/done$/, { timeout: 60_000 });
    invoice = (await page.locator('app-page-heading p').first().innerText())
      .split(' · ')[0]
      .replace(/[⁦-⁩]/g, '')
      .trim();
    expect(invoice).toMatch(/PINV/);
  });

  test('continues a supplier payment draft from Unfinished work and records it once', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(`/purchases/invoice/${invoice}/pay`);
    await expect(page.locator('app-select-field select').first()).toBeVisible();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
    const draft = await lastDraft(page, 'Payment Entry', ['party', SUPPLIER]);
    const { reference_no: reference } = await erp(page).doc<{ reference_no: string }>(
      'Payment Entry',
      draft,
    );

    const card = await draftCard(page, draft);
    await expect(card).toContainText(named('Payment to', SUPPLIER));
    await card.getByRole('button', { name: 'Continue payment' }).click();

    await expect(page).toHaveURL(new RegExp(`/purchases/invoice/${invoice}/pay\\?draft=`));
    await expect(page.locator('app-text-field input').first()).not.toHaveValue('');
    await page.getByRole('button', { name: /Confirm payment/ }).click();
    await expect(page).toHaveURL(/\/pay\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Payment recorded');

    const posted = await erp(page).list<{ name: string; docstatus: number }>(
      'Payment Entry',
      ['name', 'docstatus'],
      [['reference_no', '=', reference]],
    );
    expect(posted).toEqual([{ name: draft, docstatus: 1 }]);
  });
});

test('continues a quotation draft from Unfinished work @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales/quote/new');
  await page.getByLabel('Customer').fill(CUSTOMER);
  await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
  await page.getByLabel('Items').fill(ITEM.code);
  await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
  const draft = await lastDraft(page, 'Quotation', ['party_name', CUSTOMER]);

  const card = await draftCard(page, draft);
  await expect(card).toContainText(named('Quotation for', CUSTOMER));
  await card.getByRole('button', { name: 'Continue quotation' }).click();
  await expect(page).toHaveURL(/\/sales\/quote\/new\?draft=/);
  await expect(page.getByLabel(named('Price each', '·', ITEM.name))).toHaveValue('45');
  await page.getByRole('button', { name: 'Confirm quotation' }).click();
  await expect(page).toHaveURL(new RegExp(`/sales/quotes/${draft}$`), { timeout: 60_000 });
});

test('shows Unfinished work in Arabic with the draft @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const draft = await insertSaleDraft(page);
  try {
    await page.goto('/drafts');
    await toArabic(page);
    await expectHeading(page, 'أعمال غير مكتملة');
    await page.locator('app-search-field input').fill(draft);
    const card = page.locator('app-drafts-list app-feedback-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(named('بيع إلى', CUSTOMER));
    await expect(card).toContainText('وحدة واحدة');
    await expect(card.getByRole('button', { name: 'متابعة البيع' })).toBeVisible();
    await expect(
      page.getByText('لا تنشئ المسودات فاتورة أو دفعة مؤكدة ولا تؤثر في المخزون.'),
    ).toBeVisible();

    await card.getByRole('button', { name: 'متابعة البيع' }).click();
    await expect(page).toHaveURL(/\/sales\/new\/basket\?draft=/);
    await expect(page.locator('app-item-card', { hasText: ITEM.name })).toBeVisible();
  } finally {
    await page.goto('/');
    await deleteDraft(page, 'Sales Invoice', draft);
  }
});

test("a salesperson cannot find or open a colleague's draft @phone", async ({ page, browser }) => {
  await signIn(page, 'owner');
  const draft = await insertSaleDraft(page);
  const colleague = await browser.newContext({
    baseURL: 'http://localhost:4321',
    viewport: { width: 390, height: 900 },
  });
  try {
    const other = await colleague.newPage();
    await signIn(other, 'salesperson');
    await other.goto('/drafts');
    await other.locator('app-search-field input').fill(draft);
    await expect(other.getByText('No matching drafts')).toBeVisible();

    await other.goto(`/sales/new/basket?draft=${draft}`);
    await expect(other.getByText("This draft can't be continued")).toBeVisible();
    await other.getByRole('button', { name: 'Back to drafts' }).click();
    await expectHeading(other, 'Unfinished work');
  } finally {
    await colleague.close();
    await deleteDraft(page, 'Sales Invoice', draft);
  }
});
