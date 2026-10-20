import { Page, expect, test } from '@playwright/test';
import {
  CUSTOMER,
  ITEM,
  MAIN,
  SUPPLIER,
  choose,
  erp,
  expectHeading,
  named,
  plain,
  signIn,
  toArabic,
  topUp,
} from './support';

const TREE = { code: 'OLV-20', name: 'Olive tree · 20 L' };
const SERVICE = { code: 'SRV-GARDEN', name: 'Garden consultation' };

const remove = (page: Page, item: string) =>
  page.getByRole('button', { name: named('Remove', item) });

async function addToSale(page: Page, item: { code: string; name: string }) {
  await page.locator('app-search-field input').fill(item.code);
  await page
    .getByRole('button', { name: named('Add', item.name) })
    .first()
    .click();
}

async function startWalkInSale(page: Page) {
  await page.goto('/sales/new');
  await page.getByRole('button', { name: 'Walk-in customer' }).click();
  await choose(page.locator('app-select-field select').first(), MAIN);
}

async function items(page: Page, doctype: string, name: string) {
  const doc = await erp(page).doc<{ items: { item_code: string }[] }>(doctype, name);
  return doc.items.map((i) => i.item_code);
}

test('removes a service and a stock line from a sale before confirming @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await topUp(page, ITEM.code, MAIN, 5);
  await topUp(page, TREE.code, MAIN, 5);
  await startWalkInSale(page);
  await addToSale(page, ITEM);
  await addToSale(page, TREE);
  await addToSale(page, SERVICE);
  await page.getByRole('button', { name: /^Review basket/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/basket$/);

  const planter = remove(page, ITEM.name);
  await expect(planter).toBeVisible();
  expect((await planter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await planter.click();
  await expect(page.locator('app-item-card', { hasText: ITEM.name })).toHaveCount(0);

  // A service has no stepper: the line editor is where it goes.
  await page.locator('app-item-card', { hasText: SERVICE.name }).click();
  await expect(page).toHaveURL(/\/sales\/new\/line\/\d+$/);
  await page.getByRole('button', { name: named('Remove from sale', '·', SERVICE.name) }).click();
  await expect(page).toHaveURL(/\/sales\/new\/basket$/);
  await expect(page.locator('app-item-card')).toHaveCount(1);
  await expect(page.locator('app-item-card', { hasText: TREE.name })).toBeVisible();

  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: /^Confirm sale/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  await expectHeading(page, 'Sale confirmed');
  const invoice = plain(await page.locator('app-page-heading p').first().innerText()).split(
    ' · ',
  )[0];

  const sale = await erp(page).doc<{
    items: { item_code: string; qty: number }[];
    grand_total: number;
  }>('Sales Invoice', invoice);
  expect(sale.items.map((i) => [i.item_code, i.qty])).toEqual([[TREE.code, 1]]);
  expect(sale.grand_total).toBe(85);
});

test('removes the last line of a sale on the workspace and shows it empty @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/sales/new');
  await page.locator('app-search-field input').fill(CUSTOMER);
  await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
  await page.getByRole('button', { name: /^Continue with/ }).click();
  const panel = page.locator('section.panel');
  await choose(panel.locator('app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page.locator('app-catalog-table button.row').filter({ hasText: ITEM.code }).first().click();
  await expect(panel.locator('app-item-card')).toHaveCount(1);
  await panel.getByRole('button', { name: named('Remove', ITEM.name) }).click();
  await expect(panel.locator('app-item-card')).toHaveCount(0);
  await expect(panel.getByText('Add items from the list.')).toBeVisible();
});

test('shows Remove in Arabic on a sale line @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await topUp(page, ITEM.code, MAIN, 5);
  await startWalkInSale(page);
  await addToSale(page, ITEM);
  await page.getByRole('button', { name: /^Review basket/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/basket$/);
  await toArabic(page);
  const button = page.getByRole('button', { name: named('إزالة', ITEM.name) });
  await expect(button).toHaveText('إزالة');
  await button.click();
  await expect(page.locator('app-item-card')).toHaveCount(0);
});

test('removes a line from a purchase order and receives only the other row @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/purchases/new');
  await choose(page.locator('app-select-field select').first(), SUPPLIER);
  for (const item of [ITEM, TREE]) {
    await page.locator('app-search-field input').fill(item.code);
    await page.locator('app-item-card').filter({ hasText: item.code }).first().click();
  }
  await remove(page, TREE.name).click();
  await expect(remove(page, TREE.name)).toHaveCount(0);
  await page.getByRole('button', { name: 'Review purchase order' }).click();
  await page.getByRole('button', { name: 'Confirm purchase order' }).click();
  await expect(page).toHaveURL(/\/purchases\/order\/[^/]+$/, { timeout: 60_000 });
  const order = decodeURIComponent(page.url().split('/').pop()!);
  expect(await items(page, 'Purchase Order', order)).toEqual([ITEM.code]);
});

test('leaves a removed row out of a purchase receipt @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  const api = erp(page);
  const [company] = await api.list<{ name: string }>('Company', ['name']);
  const schedule = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const insert = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Purchase Order',
        supplier: SUPPLIER,
        company: company.name,
        schedule_date: schedule,
        items: [ITEM, TREE].map((i) => ({
          item_code: i.code,
          qty: 1,
          rate: 40,
          schedule_date: schedule,
        })),
      },
    },
  });
  expect(insert.ok(), await insert.text()).toBe(true);
  const doc = ((await insert.json()) as { message: Record<string, unknown> }).message;
  const submit = await page.request.post('/api/method/frappe.client.submit', { data: { doc } });
  expect(submit.ok(), await submit.text()).toBe(true);
  const order = doc['name'] as string;

  await page.goto(`/purchases/order/${order}/receive`);
  await expect(remove(page, TREE.name)).toBeVisible();
  await remove(page, TREE.name).click();
  await expect(page.getByText('Not included')).toBeVisible();
  await page.getByRole('button', { name: named('Add back', TREE.name) }).click();
  await expect(page.getByText('Not included')).toHaveCount(0);
  await remove(page, TREE.name).click();
  await page.getByRole('button', { name: /Confirm receipt|Record .* received/ }).click();
  await expect(page).toHaveURL(/\/receive\/done$/, { timeout: 60_000 });

  const [receipt] = await api.list<{ name: string }>(
    'Purchase Receipt',
    ['name'],
    [['Purchase Receipt Item', 'purchase_order', '=', order]],
  );
  expect(await items(page, 'Purchase Receipt', receipt.name)).toEqual([ITEM.code]);
});

test('removes a quotation line, saves a draft and reopens it without that line @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/sales/quote/new');
  await page.getByLabel('Customer').fill(CUSTOMER);
  await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
  for (const item of [ITEM, TREE]) {
    await page.getByLabel('Items').fill(item.code);
    await page.locator('app-item-card').filter({ hasText: item.code }).first().click();
  }
  await remove(page, TREE.name).click();
  await expect(remove(page, TREE.name)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
  const heading = await page.locator('app-page-heading p').first().innerText();
  const draft = heading.match(/SAL-QTN-[\d-]+/)![0];
  expect(await items(page, 'Quotation', draft)).toEqual([ITEM.code]);

  // Saved again over the same draft, a removed row really goes from ERPNext.
  await page.goto('/drafts');
  await page.locator('app-search-field input').fill(draft);
  await page.getByRole('button', { name: 'Continue quotation' }).click();
  await expect(remove(page, ITEM.name)).toBeVisible();
  await expect(remove(page, TREE.name)).toHaveCount(0);
  await page.getByLabel('Items').fill(TREE.code);
  await page.locator('app-item-card').filter({ hasText: TREE.code }).first().click();
  await remove(page, ITEM.name).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
  expect(await items(page, 'Quotation', draft)).toEqual([TREE.code]);

  await page.request.post('/api/method/frappe.client.delete', {
    data: { doctype: 'Quotation', name: draft },
  });
});
