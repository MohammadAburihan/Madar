import { expect, test } from '@playwright/test';
import { expectHeading, signIn } from './support';

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

test('the store associate sells and collects @phone', async ({ page }) => {
  await signIn(page, 'storeAssociate');
  await page.getByRole('button', { name: 'Sell' }).click();
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expectHeading(page, 'New sale');
});
