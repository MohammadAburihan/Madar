import { expect, test } from '@playwright/test';
import { expectHeading, named, signIn, toArabic } from './support';

test('+ New lists what the owner can start, and starts it @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/');
  await page.getByRole('button', { name: '+ New' }).first().click();
  await expect(page).toHaveURL(/\/new$/);
  await expectHeading(page, 'Create something');
  await expect(page.locator('app-page-heading')).toContainText(
    named('Rehan Nursery', '·', 'Owner'),
  );
  for (const label of ['Quick sale', 'Create quotation', 'Record expense', 'Add contact']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await expect(page).toHaveURL(/\/sales\/quote\/new$/);
});

test('+ New shows a warehouse worker only their tasks, in Arabic @phone', async ({ page }) => {
  await signIn(page, 'warehouse');
  await page.goto('/new');
  await toArabic(page);
  await expectHeading(page, 'إنشاء جديد');
  await expect(page.getByRole('button', { name: 'نقل المخزون' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'بيع سريع' })).toHaveCount(0);
  await page.getByRole('button', { name: 'نقل المخزون' }).click();
  await expect(page).toHaveURL(/\/inventory\/transfer/);
});
