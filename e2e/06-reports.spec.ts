import { expect, test } from '@playwright/test';
import { CUSTOMER, SUPPLIER, choose, expectHeading, signIn } from './support';

test('reads profit and money on a phone, then profit by month @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/reports');
  await expectHeading(page, 'Reports');
  await expect(page.locator('app-profit-card')).toContainText('Sales income');
  await expect(page.locator('app-money-card')).toContainText('Net for the period');
  await page.getByRole('button', { name: /Profit by month/ }).click();
  await expect(page).toHaveURL(/\/reports\/profit/);
  await expectHeading(page, 'Profit by month');
  await expect(page.locator('app-profit-card')).toHaveCount(4);
});

test("opens a customer's statement from the reports page @phone", async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/reports');
  await page.getByRole('button', { name: /Customer statement/ }).click();
  await expect(page).toHaveURL(/\/reports\/customer$/);
  await page.locator('app-search-field input').fill(CUSTOMER);
  await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
  await expect(page.locator('app-totals-card').first()).toContainText('Outstanding');
  await expect(page.locator('app-statement-entries')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share as PDF' })).toBeVisible();
});

test('shows the reports workspace with figures and months @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/reports');
  await expect(page.locator('app-metric-cards')).toContainText('Profit');
  await page.getByRole('radio', { name: 'This year' }).click();
  await expect(page.locator('app-data-table tbody tr').last()).toContainText('Total');
});

test("downloads a customer's statement as a PDF @desktop", async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(`/reports/customer?party=${encodeURIComponent(CUSTOMER)}`);
  await expect(page.locator('app-metric-cards')).toContainText('Outstanding');
  await expect(page.locator('app-data-table tbody tr').first()).toContainText('Opening balance');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
});

test("shows a supplier's statement @desktop", async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/reports/supplier');
  await expectHeading(page, 'Supplier statement');
  await choose(page.locator('app-select-field select').first(), SUPPLIER);
  await page.getByRole('radio', { name: 'This year' }).click();
  await expect(
    page.locator('app-data-table tbody tr').filter({ hasText: 'Supplier invoice' }).first(),
  ).toBeVisible();
});
