import { expect, test } from '@playwright/test';
import { CUSTOMER, MAIN, choose, expectHeading, named, plain, signIn, topUp } from './support';

const TREE = { code: 'OLV-20', name: 'Olive tree · 20 L' };
const SERVICE = { code: 'SRV-GARDEN', name: 'Garden consultation' };

const plusDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

test.describe.serial('ordering from a quotation @phone', () => {
  let quotation = '';
  let order = '';

  test('makes a sales order from a confirmed quotation and shows what is left to do', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    // Two trees leave Main below; earlier runs may have sold them all.
    await topUp(page, TREE.code, MAIN, 5);
    await page.goto('/sales/quote/new');
    await page.getByLabel('Customer').fill(CUSTOMER);
    await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
    for (const item of [TREE, SERVICE]) {
      await page.getByLabel('Items').fill(item.code);
      await page.locator('app-item-card').filter({ hasText: item.code }).first().click();
    }
    await page.getByRole('button', { name: named('One more', TREE.name) }).click();
    await page.getByRole('button', { name: 'Confirm quotation' }).click();
    await expect(page).toHaveURL(/\/sales\/quotes\/[^/]+$/, { timeout: 60_000 });
    quotation = decodeURIComponent(page.url().split('/').pop()!);

    await page.getByRole('button', { name: 'Create sales order' }).click();
    await expect(page).toHaveURL(/\/sales\/orders\/[^/]+$/, { timeout: 60_000 });
    order = decodeURIComponent(page.url().split('/').pop()!);
    await expectHeading(page, named('Sales order', order));
    await expect(page.locator('app-page-heading')).toContainText(
      named(CUSTOMER, '·', 'From', quotation),
    );
    for (const [kind, state] of [
      ['Order', 'Confirmed'],
      ['Delivery', 'Pending'],
      ['Invoice', 'Not issued'],
    ]) {
      await expect(
        page.locator('app-status-chip', { hasText: named(kind, ':', state) }),
      ).toBeVisible();
    }
    const tree = page.locator('app-item-card', { hasText: TREE.name });
    await expect(tree).toContainText(named('2', 'ordered ·', '0', 'delivered'));
    await expect(tree).toContainText('ILS 170.00');
    const service = page.locator('app-item-card', { hasText: SERVICE.name });
    await expect(service).toContainText(named(`${SERVICE.code} · 1 Visit`));
    await expect(service).toContainText(named('Service work pending'));
  });

  test('moves the expected delivery and keeps it', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/sales/orders/${order}`);
    const expected = page.getByLabel('Expected delivery');
    await expect(expected).not.toHaveValue('');
    const later = plusDays(await expected.inputValue(), 3);
    await expected.fill(later);
    await page.getByRole('button', { name: 'Save delivery date' }).click();
    await expect(page.getByText('Delivery date saved')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByLabel('Expected delivery')).toHaveValue(later);
  });

  test('delivers part of the goods', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/sales/orders/${order}`);
    await page.getByRole('button', { name: 'Prepare delivery' }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/orders/${order}/deliver$`));
    await expectHeading(page, 'Deliver order');
    await expect(page.locator('app-page-heading')).toContainText(named(order, '·', CUSTOMER));
    await choose(page.getByLabel('Warehouse'), MAIN);
    const tree = page.locator('app-item-card', { hasText: TREE.name });
    await expect(tree).toContainText(named('Ordered', '2', '· Previously delivered', '0'));
    await expect(tree).toContainText(named('Deliver now', '2'));
    await page.getByLabel(named('Quantity to deliver')).fill('1');
    await expect(
      page.locator('app-feedback-card', { hasText: 'Before you confirm' }),
    ).toContainText(named('Deliver', `1 × ${TREE.name}`, 'from', MAIN));
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await expect(page).toHaveURL(/\/deliver\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Delivery confirmed');
    await expect(page.locator('app-feedback-card').first()).toContainText(
      named('Partly delivered ·', '1', 'of', '3'),
    );
    await page.getByRole('button', { name: 'Open sales order' }).click();
    await expect(
      page.locator('app-status-chip', { hasText: named('Delivery', ':', 'Partly delivered') }),
    ).toBeVisible();
    await expect(page.locator('app-item-card', { hasText: TREE.name })).toContainText(
      named('2', 'ordered ·', '1', 'delivered'),
    );
  });

  test('delivers the rest with the consultation done, then invoices the order', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(`/sales/orders/${order}/deliver`);
    await choose(page.getByLabel('Warehouse'), MAIN);
    await expect(page.getByLabel(named('Quantity to deliver'))).toHaveValue('1');
    await page.getByLabel(named('Work done now ·', SERVICE.code)).fill('1');
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await expect(page).toHaveURL(/\/deliver\/done$/, { timeout: 60_000 });
    await expect(page.locator('app-feedback-card').first()).toContainText(
      named('Delivered ·', '3', 'of', '3'),
    );

    await page.getByRole('button', { name: 'Review invoice from order' }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/orders/${order}/invoice$`));
    await expectHeading(page, 'Review order invoice');
    const review = page.locator('app-feedback-card').first();
    await expect(review).toContainText(named('Invoice only ·', 'ILS 320.00'));
    await expect(review).toContainText('Already delivered goods will not move again.');
    await expect(review).toContainText(named('Received', '0.00', '· Due', '320.00'));
    await page.getByRole('button', { name: 'Confirm invoice' }).click();
    await expect(page).toHaveURL(/\/invoice\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Order invoice recorded');
    await expect(page.locator('app-feedback-card').first()).toContainText(
      named('Unpaid', '·', 'ILS 320.00'),
    );
    // Its goods left on the order's delivery notes: Sales says so, not "Invoice only".
    const invoiceName = plain(await page.locator('app-page-heading p').first().innerText()).split(
      ' · ',
    )[0];
    await page.goto('/sales');
    await page.locator('app-search-field input').fill(invoiceName);
    await expect(page.locator('app-feedback-card', { hasText: invoiceName })).toContainText(
      'Goods delivered',
    );
    await page.goto(`/sales/invoices/${invoiceName}`);
    await expect(page.locator('app-status-chip', { hasText: 'Goods: Delivered' })).toBeVisible();
    await page.goto(`/sales/orders/${order}`);
    for (const [kind, state] of [
      ['Order', 'Completed'],
      ['Delivery', 'Delivered'],
      ['Invoice', 'Invoiced'],
    ]) {
      await expect(
        page.locator('app-status-chip', { hasText: named(kind, ':', state) }),
      ).toBeVisible();
    }
    await expect(page.locator('app-item-card', { hasText: SERVICE.name })).toContainText(
      'Service work done',
    );
    await expect(page.getByRole('button', { name: 'Prepare delivery' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create invoice' })).toHaveCount(0);
  });

  test('links the ordered quotation to its order instead of ordering again', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/sales/quotes/${quotation}`);
    await expect(page.getByRole('button', { name: 'Open sales order' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create sales order' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open sales order' }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/orders/${order}$`));
  });
});

test('opens a sales order from the orders table @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales');
  await page.getByRole('radio', { name: 'Orders' }).click();
  const row = page
    .locator('app-data-table tbody tr')
    .filter({ hasText: /SAL-ORD-/ })
    .first();
  const name = (await row.locator('td').first().innerText()).replace(/[⁦-⁩]/g, '').trim();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/sales/orders/${name}$`));
  await expectHeading(page, named('Sales order', name));
  await expect(page.locator('app-status-chip').first()).toContainText(named('Order', ':'));
});
