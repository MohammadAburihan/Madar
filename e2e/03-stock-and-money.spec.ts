import { expect, test } from '@playwright/test';
import { ITEM, MAIN, choose, expectHeading, signIn, topUp } from './support';

// Receipts land in Stores and sales take from Main: this move keeps Main stocked for the sales that follow.
test('moves stock between warehouses @phone', async ({ page }) => {
  await signIn(page, 'owner');
  // Repeated runs move Stores' stock away; keep enough for this move.
  await topUp(page, ITEM.code, 'Stores', 5);
  await page.goto('/inventory/transfer');
  await expectHeading(page, 'Move stock');
  await page.locator('app-search-field input').fill(ITEM.code);
  await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
  await expect(page.locator('app-status-chip', { hasText: 'Ready' })).toBeVisible();
  const selects = page.locator('app-select-field select');
  await choose(selects.nth(0), 'Stores');
  await choose(selects.nth(1), MAIN);
  await page.locator('app-text-field input').first().fill('5');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await expect(page).toHaveURL(/\/inventory\/transfer\/review$/);
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await expect(page).toHaveURL(/\/inventory\/transfer\/done$/, { timeout: 60_000 });
  await expectHeading(page, 'Transfer complete');
});

test('shows stock by warehouse and an item history on the inventory page @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/inventory');
  const row = page.locator('app-data-table tbody tr').filter({ hasText: ITEM.code }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('app-data-table')).toHaveCount(2);
});

test('records an expense with a receipt photo and lists it under Money @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/money/expense');
  const selects = page.locator('app-select-field select');
  await expect(selects.first()).toBeVisible();
  await selects.first().selectOption({ label: 'Travel Expenses' });
  await page.locator('app-text-field input').first().fill('18.25');
  await page.locator('app-receipt-picker input[type=file]').setInputFiles('e2e/receipt.png');
  await page.getByRole('button', { name: 'Review expense' }).click();
  await expect(page).toHaveURL(/\/money\/expense\/review$/);
  await page.getByRole('button', { name: /^Record expense$/ }).click();
  await expect(page).toHaveURL(/\/money\/expense\/recorded$/, { timeout: 60_000 });
  await page.getByRole('button', { name: /^Done$/ }).click();
  await expect(page).toHaveURL(/\/money$/);
  await expect(page.locator('app-feedback-card', { hasText: '18.25' }).first()).toBeVisible();
});
