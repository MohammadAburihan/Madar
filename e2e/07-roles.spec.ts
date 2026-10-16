import { expect, test } from '@playwright/test';
import { ITEM, MAIN, choose, expectHeading, named, signIn } from './support';

test("the project manager's home leads to projects @phone", async ({ page }) => {
  await signIn(page, 'projectManager');
  await page.getByRole('button', { name: 'Supply a project' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expectHeading(page, /Projects/);
});

test('the warehouse worker moves stock and receives goods, without sales or money @phone', async ({
  page,
}) => {
  await signIn(page, 'warehouse');
  await expect(page.getByRole('button', { name: 'Receive goods' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sales' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Transfer stock' }).click();
  await expect(page).toHaveURL(/\/inventory\/transfer$/);
});

test('the purchasing officer works from the purchasing workspace @desktop', async ({ page }) => {
  await signIn(page, 'purchasing');
  const nav = page.getByRole('navigation').first();
  await expect(nav.getByRole('link', { name: 'Money' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Purchases' }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await expect(page.locator('app-data-table').first()).toBeVisible();
});

test('the store associate sells, and Sales shows only their own sales @phone', async ({ page }) => {
  await signIn(page, 'storeAssociate');
  await page.getByRole('button', { name: 'Sell' }).click();
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expectHeading(page, 'New sale');
  await page.getByRole('button', { name: 'Walk-in customer' }).click();
  await choose(page.locator('app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page
    .getByRole('button', { name: named('Add', ITEM.name) })
    .first()
    .click();
  await page.getByRole('button', { name: /^Review basket/ }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: /^Confirm sale/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  const subtitle = await page.locator('app-page-heading p').first().innerText();
  const own = subtitle
    .split(' · ')[0]
    .replace(/[\u2066-\u2069]/g, '')
    .trim();

  await page.goto('/sales');
  await page.locator('app-search-field input').fill(own);
  await expect(page.locator('app-feedback-card', { hasText: own })).toHaveCount(1);
  // The seeded first invoice belongs to someone else: a store associate doesn't see it.
  await page.locator('app-search-field input').fill('ACC-SINV-2026-00001');
  await expect(page.getByText('Nothing matches that search.')).toBeVisible();
});
