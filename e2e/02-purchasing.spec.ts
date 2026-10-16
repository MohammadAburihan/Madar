import { expect, test } from '@playwright/test';
import { ITEM, SUPPLIER, choose, expectHeading, runId, signIn } from './support';

// One order through its whole life; it also restocks the planter the later flows sell, move and supply.
test.describe.serial('buying from a supplier @phone', () => {
  let order = '';
  let invoice = '';

  test('creates and confirms a purchase order', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/purchases/new');
    await expectHeading(page, 'New purchase order');
    await choose(page.locator('app-select-field select').first(), SUPPLIER);
    await page.locator('app-search-field input').fill(ITEM.code);
    await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
    const more = page.getByRole('button', { name: /^One more/ }).first();
    for (let i = 0; i < 7; i++) {
      await more.click();
    }
    await page.getByRole('button', { name: 'Review purchase order' }).click();
    await expect(page).toHaveURL(/\/purchases\/new\/review$/);
    await page.getByRole('button', { name: 'Confirm purchase order' }).click();
    await expect(page).toHaveURL(/\/purchases\/order\/[^/]+$/, { timeout: 60_000 });
    order = decodeURIComponent(page.url().split('/').pop()!);
    await expectHeading(page, 'Purchase order');
  });

  test('receives the goods into stock', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/purchases/order/${order}`);
    await page
      .getByRole('button', { name: /^Receive/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/receive$/);
    await page.getByRole('button', { name: /Confirm receipt|Record .* received/ }).click();
    await expect(page).toHaveURL(/\/receive\/done$/, { timeout: 60_000 });
  });

  test("records the supplier's invoice", async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/purchases/order/${order}`);
    await page.getByRole('button', { name: 'Record supplier invoice' }).click();
    await page.locator('app-text-field input').first().fill(`GC-${runId()}`);
    await page.getByRole('button', { name: /^Record supplier invoice$/ }).click();
    await expect(page).toHaveURL(/\/invoice\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Supplier invoice recorded');
    const subtitle = await page.locator('app-page-heading p').first().innerText();
    invoice = subtitle
      .split(' · ')[0]
      .replace(/[\u2066-\u2069]/g, '')
      .trim();
    expect(invoice).toMatch(/PINV/);
  });

  test('pays the supplier', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/purchases/invoice/${invoice}`);
    await page.getByRole('button', { name: /^Pay supplier$/ }).click();
    await expect(page.locator('app-select-field select').first()).toBeVisible();
    await page.getByRole('button', { name: /Confirm payment/ }).click();
    await expect(page).toHaveURL(/\/pay\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Payment recorded');
    await expect(page.locator('app-status-chip').first()).toHaveText('Paid in full');
    await page.getByRole('button', { name: 'View supplier invoice' }).click();
    await expect(page).toHaveURL(new RegExp(`/purchases/invoice/${invoice}$`));
  });
});
