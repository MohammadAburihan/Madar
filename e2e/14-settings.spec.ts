import { expect, test } from '@playwright/test';
import { expectHeading, named, signIn } from './support';

test('shows the connection and switches the language @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/more');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expectHeading(page, 'Connection settings');
  await expect(page.locator('app-page-heading')).toContainText(
    named('Rehan Nursery', '·', 'Owner'),
  );
  await expect(page.getByLabel('Business name')).toHaveValue('Rehan Nursery');
  await expect(page.getByLabel('Workspace address')).toHaveValue('http://localhost:4321');
  await expect(page.getByLabel('Currency')).toHaveValue(/^ILS/);
  await page.getByRole('combobox', { name: /^Language/ }).selectOption('ar');
  await expectHeading(page, 'إعدادات الاتصال');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel('اسم المنشأة')).toHaveValue('Rehan Nursery');
  await page.getByRole('combobox', { name: /^اللغة/ }).selectOption('en');
  await expectHeading(page, 'Connection settings');
});

test('signs out, and the next person signs in fresh @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expectHeading(page, 'Connection settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, 'salesperson');
  await page.goto('/settings');
  await expect(page.locator('app-page-heading')).toContainText(named('Salesperson'));
});
