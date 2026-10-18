import { expect, test } from '@playwright/test';
import { MAIN, SUPPLIER, choose, expectHeading, signIn, toArabic } from './support';

const card = (page: import('@playwright/test').Page, title: string) =>
  page.locator('app-totals-card').filter({ hasText: title });

test('opens the breakdowns from the reports page and reads them for the year @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/reports');
  await page.getByRole('button', { name: /^Breakdowns/ }).click();
  await expect(page).toHaveURL(/\/reports\/breakdowns$/);
  await expectHeading(page, 'Breakdowns');
  await choose(page.locator('app-select-field select').first(), 'This year');
  await expect(page.locator('app-profit-card')).toContainText('Sales for the period');
  await expect(page.locator('app-profit-card')).toContainText('Stock value today');
  await expect(card(page, 'Sales by item')).toContainText('sold');
  await expect(card(page, 'Sales by customer')).toBeVisible();
  await expect(card(page, 'Purchases by supplier')).toContainText(SUPPLIER);
  await expect(card(page, 'Stock value by warehouse')).toContainText(MAIN);
});

test('reads the breakdowns in Arabic @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/reports/breakdowns');
  await toArabic(page);
  await expectHeading(page, 'التفاصيل');
  await choose(page.locator('app-select-field select').first(), 'هذه السنة');
  await expect(page.locator('app-profit-card')).toContainText('المبيعات للفترة');
  await expect(card(page, 'قيمة المخزون حسب المستودع')).toBeVisible();
});

test('opens the breakdowns from the reports workspace @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/reports');
  await page.getByRole('button', { name: /^Breakdowns/ }).click();
  await expectHeading(page, 'Breakdowns');
  await expect(page.locator('app-profit-card')).toContainText('Sales for the period');
  await expect(card(page, 'Stock value by warehouse')).toContainText(MAIN);
});

test('keeps breakdowns from roles without reports @phone', async ({ page }) => {
  await signIn(page, 'salesperson');
  await page.goto('/reports/breakdowns');
  await expect(page.locator('app-feedback-card')).toBeVisible();
  await expect(page.locator('app-profit-card')).toHaveCount(0);
});
