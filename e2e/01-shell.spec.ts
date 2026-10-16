import { expect, test } from '@playwright/test';
import { expectHeading, heading, signIn, toArabic } from './support';

test('the owner signs in to Home and switches to Arabic @phone @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await expect(page).toHaveURL(/\/$/);
  await expect(heading(page)).toContainText('Rehan');
  await toArabic(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});

test('the More tab opens every other area on a phone @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.getByRole('link', { name: 'More' }).click();
  await expectHeading(page, 'More');
  for (const [label, path, title] of [
    ['Purchases', /\/purchases$/, /Purchas/],
    ['Money', /\/money$/, /Payments/],
    ['Projects', /\/projects$/, /Projects/],
    ['Reports', /\/reports$/, 'Reports'],
  ] as const) {
    await page.goto('/more');
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(heading(page)).toHaveText(title);
  }
});

test('each role sees only its areas in the sidebar @desktop', async ({ page }) => {
  const nav = page.getByRole('navigation').first();
  await signIn(page, 'salesperson');
  await expect(nav.getByRole('link', { name: 'Sales' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Purchases' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Reports' })).toHaveCount(0);
});
