import { expect, test } from '@playwright/test';
import { CUSTOMER, choose, expectHeading, named, runId, signIn, toArabic } from './support';

test.describe.serial('adding and editing a contact @phone', () => {
  const name = `E2E Contact ${runId()}`;
  let page_ = '';

  test('adds a customer with how to reach them', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Add customer or supplier' }).click();
    await expect(page).toHaveURL(/\/contacts\/new/);
    await expectHeading(page, 'Add contact');
    await choose(page.getByLabel('Contact type'), 'Customer');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByText('Enter a name.')).toBeVisible();
    await page.getByLabel('Name *').fill(name);
    await page.getByLabel('Phone').fill('059-000-7311');
    await page.getByLabel('Email').fill('not-an-email');
    await expect(page.getByText('Enter an email like name@example.com.')).toBeVisible();
    await page.getByLabel('Email').fill('e2e.contact@example.com');
    await page.getByLabel('Address').fill('5 Olive Lane');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/, { timeout: 30_000 });
    page_ = page.url();
    await expectHeading(page, name);
    for (const line of ['059-000-7311', 'e2e.contact@example.com', '5 Olive Lane']) {
      await expect(page.locator('p.lines')).toContainText(line);
    }
  });

  test('edits the phone and address, and finds the new customer in the list', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(page_);
    await page.getByRole('button', { name: 'Edit contact' }).click();
    await expectHeading(page, 'Edit contact');
    await expect(page.getByLabel('Phone')).toHaveValue('059-000-7311');
    await page.getByLabel('Phone').fill('059-000-7322');
    await page.getByLabel('Address').fill('7 Olive Lane');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(page_, { timeout: 30_000 });
    await expect(page.locator('p.lines')).toContainText('059-000-7322');
    await expect(page.locator('p.lines')).toContainText('7 Olive Lane');
    await page.goto('/contacts');
    await page.locator('app-search-field input').fill(name);
    await expect(page.locator('app-person-card', { hasText: name })).toContainText('059-000-7322');
  });

  test('shows a new customer’s empty history', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(page_);
    await page.getByRole('button', { name: 'View transactions' }).click();
    await expectHeading(page, 'Transaction history');
    await expect(page.getByText('No transactions yet.')).toBeVisible();
  });
});

test('lists a customer’s invoices and payments, and opens an invoice @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(`/contacts/customers/${encodeURIComponent(CUSTOMER)}/history`);
  await expectHeading(page, 'Transaction history');
  const invoice = page.locator('button.card', { hasText: 'Invoice confirmed' }).first();
  await expect(invoice).toContainText(named('Paid'));
  await expect(
    page.locator('app-feedback-card', { hasText: 'Customer payment' }).first(),
  ).toBeVisible();
  await invoice.click();
  await expect(page).toHaveURL(/\/sales\/invoices\/[^/]+$/);
});

test('adds a supplier from the desktop workspace @desktop', async ({ page }) => {
  const name = `E2E Supplier ${runId()}`;
  await signIn(page, 'owner');
  await page.goto('/contacts?kind=suppliers');
  await page.getByRole('button', { name: '+ Add contact' }).click();
  await expect(page.getByLabel('Contact type')).toHaveValue('suppliers');
  await page.getByLabel('Name *').fill(name);
  await page.getByLabel('Phone').fill('02-000-7333');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page).toHaveURL(/\/contacts\/suppliers\/[^/]+$/, { timeout: 30_000 });
  await expectHeading(page, name);
  await expect(page.getByRole('button', { name: 'Edit supplier' })).toBeVisible();
});

test('a salesperson adds customers but not suppliers @phone', async ({ page }) => {
  await signIn(page, 'salesperson');
  await page.goto('/contacts/new');
  await toArabic(page);
  await expectHeading(page, 'إضافة جهة اتصال');
  const type = page.getByLabel('نوع جهة الاتصال');
  await expect(type.locator('option')).toHaveText(['عميل']);
});
