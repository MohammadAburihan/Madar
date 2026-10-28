import { expect, test } from '@playwright/test';
import { expectHeading, heading, signIn, toArabic } from './support';

test('Home has an Assistant action that opens the Assistant @phone @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  const action = page.getByRole('button', { name: 'Assistant', exact: true });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expectHeading(page, 'Assistant');
});

test('Home shows the Assistant action in Arabic @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await expect(heading(page)).toContainText('Rehan');
  await toArabic(page);
  await page.getByRole('button', { name: 'المساعد', exact: true }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expectHeading(page, 'المساعد');
});

test('More lists Sales and Inventory too and opens them @phone', async ({ page }) => {
  await signIn(page, 'owner');
  for (const [label, path, title] of [
    ['Sales', /\/sales$/, 'Sales'],
    ['Inventory', /\/inventory$/, 'Inventory'],
  ] as const) {
    await page.goto('/more');
    await expectHeading(page, 'More');
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(heading(page)).toHaveText(title);
  }
});

test('More lists Sales and Inventory in Arabic @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/more');
  await expectHeading(page, 'More');
  await toArabic(page);
  await expect(page.getByRole('button', { name: 'المبيعات', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'المخزون', exact: true })).toBeVisible();
});

test('Home actions and More rows carry an icon and keep their names @phone', async ({ page }) => {
  await signIn(page, 'owner');
  const assistant = page.getByRole('button', { name: 'Assistant', exact: true });
  await expect(assistant.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  for (const name of ['Sell', 'Receive payment']) {
    await expect(
      page.getByRole('button', { name, exact: true }).locator('svg[aria-hidden="true"]'),
    ).toHaveCount(1);
  }
  await page.goto('/more');
  await expectHeading(page, 'More');
  for (const name of ['Sales', 'Inventory', 'Switch business']) {
    await expect(
      page.getByRole('button', { name, exact: true }).locator('svg[aria-hidden="true"]'),
    ).toHaveCount(1);
  }
});

test('Home actions and More rows carry an icon in Arabic @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await expect(heading(page)).toContainText('Rehan');
  await toArabic(page);
  await expect(
    page.getByRole('button', { name: 'المساعد', exact: true }).locator('svg[aria-hidden="true"]'),
  ).toHaveCount(1);
  await page.goto('/more');
  await expect(
    page.getByRole('button', { name: 'المبيعات', exact: true }).locator('svg[aria-hidden="true"]'),
  ).toHaveCount(1);
});
