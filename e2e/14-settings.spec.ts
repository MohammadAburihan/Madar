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

const DESK = 'https://desk.example.test';

async function withDesk(page: Page): Promise<void> {
  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { erpnextUrl: '', deskUrl: DESK } }),
  );
  await page.context().route(`${DESK}/**`, (route) => route.fulfill({ body: '' }));
}

test('no Open ERPNext row without a Desk address @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/settings');
  await expectHeading(page, 'Connection settings');
  await expect(page.getByRole('button', { name: /Open ERPNext/ })).toHaveCount(0);
});

test('the owner opens ERPNext Desk in a new tab @desktop', async ({ page, context }) => {
  await withDesk(page);
  await signIn(page, 'owner');
  await page.goto('/settings');
  const row = page.getByRole('button', { name: 'Open ERPNext Desk' });
  await expect(row).toContainText("Desk, ERPNext's full screens");
  const [desk] = await Promise.all([context.waitForEvent('page'), row.click()]);
  expect(desk.url()).toBe(`${DESK}/`);
});

test('the owner sees Open ERPNext in Arabic @phone', async ({ page }) => {
  await withDesk(page);
  await signIn(page, 'owner');
  await page.goto('/settings');
  await page.getByRole('combobox', { name: /^Language/ }).selectOption('ar');
  await expect(page.getByRole('button', { name: /فتح ERPNext/ })).toContainText(
    'Desk، شاشات ERPNext الكاملة',
  );
});

test('a salesperson does not see Open ERPNext @desktop', async ({ page }) => {
  await withDesk(page);
  await signIn(page, 'salesperson');
  await page.goto('/settings');
  await expectHeading(page, 'Connection settings');
  await expect(page.getByRole('button', { name: /Open ERPNext/ })).toHaveCount(0);
});
