import { expect, test } from '@playwright/test';
import { CUSTOMER, expectHeading, named, signIn } from './support';

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
