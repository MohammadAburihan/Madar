import { expect, test } from '@playwright/test';
import { ITEM, SUPPLIER, choose, expectHeading, runId, signIn, toArabic } from './support';

test.describe('adding a new item while buying @phone', () => {
  test('adds the searched item to the catalog and comes back with it on the order', async ({
    page,
  }) => {
    const name = `E2E new pot ${runId()}`;
    const code = `E2E-NEW-${runId()}`;
    await signIn(page, 'owner');
    await page.goto('/purchases/new');
    await choose(page.locator('app-select-field select').first(), SUPPLIER);
    // One line already on the order: it must still be there after the trip.
    await page.locator('app-search-field input').fill(ITEM.code);
    await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
    await page.locator('app-search-field input').fill(name);
    await expect(page.getByText('No purchasable items match.')).toBeVisible();
    await page.getByRole('button', { name: '+ Add item' }).click();
    await expect(page).toHaveURL(/\/catalog\/new\?/);
    await expectHeading(page, 'Add item or service');
    const fields = page.locator('app-text-field input');
    await expect(fields.nth(0)).toHaveValue(name);
    await fields.nth(1).fill(code);
    const selects = page.locator('app-select-field select');
    await choose(selects.nth(1), 'Products');
    await choose(selects.nth(2), 'Unit');
    await page.locator('app-text-field', { hasText: 'Opening cost' }).locator('input').fill('12');
    await page.getByRole('button', { name: 'Save item' }).click();
    await expect(page).toHaveURL(/\/purchases\/new\?/, { timeout: 60_000 });
    await expectHeading(page, 'New purchase order');
    await expect(page.locator('app-select-field select').first()).toHaveValue(/Green Clay/);
    await expect(page.locator('.line').filter({ hasText: ITEM.name })).toBeVisible();
    await expect(page.locator('.line').filter({ hasText: name })).toBeVisible();
  });

  test('keeps the order when the new item is cancelled', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/purchases/new');
    await choose(page.locator('app-select-field select').first(), SUPPLIER);
    await page.locator('app-search-field input').fill(ITEM.code);
    await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
    await page.getByRole('radio', { name: 'Services' }).click();
    await page.getByRole('button', { name: '+ Add item' }).click();
    // Started as a service, as the search was.
    await expect(page.locator('app-select-field select').first()).toHaveValue('service');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/purchases\/new/);
    await expect(page.locator('.line').filter({ hasText: ITEM.name })).toBeVisible();
  });

  test('offers it in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/purchases/new');
    await toArabic(page);
    await choose(page.locator('app-select-field select').first(), SUPPLIER);
    await expect(page.getByRole('button', { name: '+ إضافة صنف' })).toBeVisible();
  });

  test('a fresh visit still starts a new order', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/purchases/new');
    await choose(page.locator('app-select-field select').first(), SUPPLIER);
    await page.getByRole('button', { name: '+ Add item' }).click();
    await page.goto('/purchases');
    await page.goto('/purchases/new');
    await expect(page.locator('app-select-field select').first()).toHaveValue('');
  });
});

test('offers Add item on the desktop purchase order @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/purchases/new');
  await choose(page.locator('app-select-field select').first(), SUPPLIER);
  await page.getByRole('button', { name: '+ Add item' }).click();
  await expect(page).toHaveURL(/\/catalog\/new\?.*return=purchase/);
});
