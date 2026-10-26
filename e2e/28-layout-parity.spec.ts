import { expect, test } from '@playwright/test';
import { CUSTOMER, expectHeading, signIn } from './support';

test('offers supplying a project from Inventory on a phone @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Supply a project' }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("opens a project's purchase order from its page on a phone @phone", async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/projects');
  await page.locator('button.card').filter({ hasText: 'Garden installation' }).first().click();
  const records = page.locator('app-record-links', { hasText: 'Project records' });
  await expect(records).toContainText('Project records');
  await records
    .getByRole('button', { name: /Purchase/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/purchases\/order\/[^/]+$/);
});

test('offers Supply a project from the inventory workspace @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Supply a project' }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("the workers panel has the worker page's actions @desktop", async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/workers');
  await page.locator('app-search-field input').fill('Khaled');
  await page.locator('app-data-table tbody tr').filter({ hasText: 'Khaled' }).first().click();
  const panel = page.locator('section.panel');
  for (const action of ['Assign shift', 'Set salary', 'Give an advance', 'Edit worker']) {
    await expect(panel.getByRole('button', { name: action })).toBeVisible();
  }
  await panel.getByRole('button', { name: 'Log hours' }).click();
  await expect(page).toHaveURL(/\/workers\/hours\/new\?worker=/);
});

test("the contacts panel has the contact page's actions @desktop", async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/contacts');
  await page.locator('app-search-field input').fill(CUSTOMER);
  await page.locator('app-data-table tbody tr').filter({ hasText: CUSTOMER }).first().click();
  const panel = page.locator('section.panel');
  await expect(panel.getByRole('button', { name: 'Edit contact' })).toBeVisible();
  await panel.getByRole('button', { name: 'View transactions' }).click();
  await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+\/history$/);
  await expectHeading(page, /./);
});
