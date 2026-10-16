import { expect, test } from '@playwright/test';
import { ITEM, MAIN, choose, expectHeading, named, signIn, toArabic } from './support';

test('sells in Arabic, right to left, from start to receipt @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales/new');
  await toArabic(page);
  await expectHeading(page, 'عملية بيع جديدة');
  await page.getByRole('button', { name: 'عميل نقدي' }).click();
  await choose(page.locator('app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page
    .getByRole('button', { name: named('إضافة', ITEM.name) })
    .first()
    .click();
  await page.getByRole('button', { name: /^مراجعة السلة/ }).click();
  await page.getByRole('button', { name: 'المتابعة إلى الدفع' }).click();
  await page.getByRole('button', { name: /^تأكيد البيع/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  await expectHeading(page, 'تم تأكيد البيع');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('reads the reports in Arabic @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/reports');
  await toArabic(page);
  await expectHeading(page, 'التقارير');
  await expect(page.locator('app-metric-cards')).toContainText('الربح');
});
