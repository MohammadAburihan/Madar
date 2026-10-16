import { expect, test } from '@playwright/test';
import { CUSTOMER, SUPPLIER, expectHeading, named, signIn, toArabic } from './support';

test.describe('customers and suppliers @phone', () => {
  test('finds a customer, sees what they owe, and starts a sale with them', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/contacts');
    await expectHeading(page, 'Customers & suppliers');
    // The test site has more customers than one page: the list says so.
    await expect(
      page.getByText(named('Showing the first', '30', '. Search to find others.')),
    ).toBeVisible();
    await page.locator('app-search-field input').fill(CUSTOMER);
    const card = page.locator('app-person-card', { hasText: CUSTOMER }).first();
    await expect(card).toContainText('059-000-0142');
    const balance = (await card.locator('.balance').innerText()).replace(/[⁦-⁩]/g, '');
    const owed = balance.replace('Outstanding ', '');
    await card.click();

    await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/);
    await expectHeading(page, CUSTOMER);
    await expect(page.locator('app-page-heading')).toContainText(named('Customer ·', CUSTOMER));
    await expect(page.getByText('059-000-0142')).toBeVisible();
    // The list and the page agree on what the customer owes.
    await expect(page.locator('app-totals-card')).toContainText('Invoice total');
    await expect(page.locator('app-totals-card')).toContainText(owed);
    await expect(page.locator('app-feedback-card', { hasText: 'Latest sale' })).toContainText(
      'Invoice confirmed',
    );
    await page.getByRole('button', { name: named('Sell to', 'Lina') }).click();
    await expect(page).toHaveURL(/\/sales\/new\?customer=/);
    await expect(page.getByRole('button', { name: named('Continue with', 'Lina') })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('opens a supplier and starts an order with them', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/contacts');
    await page.getByRole('radio', { name: 'Suppliers' }).click();
    await page.locator('app-person-card', { hasText: SUPPLIER }).first().click();
    await expect(page).toHaveURL(/\/contacts\/suppliers\/[^/]+$/);
    await expectHeading(page, SUPPLIER);
    await expect(page.locator('app-page-heading')).toContainText(named('Supplier ·', SUPPLIER));
    await expect(page.locator('app-feedback-card').first()).toContainText('Outstanding');
    await page.getByRole('button', { name: named('Buy from', SUPPLIER) }).click();
    await expect(page).toHaveURL(/\/purchases\/new\?supplier=/);
    await expect(page.getByLabel('Supplier')).toHaveValue(SUPPLIER, { timeout: 15_000 });
    await page.goto('/contacts?kind=suppliers');
    await expect(page.getByRole('radio', { name: 'Suppliers' })).toBeChecked();
  });

  test('keeps each role to the contacts it works with, even by link', async ({ page }) => {
    await signIn(page, 'salesperson');
    await page.goto('/contacts');
    await expect(page.getByRole('radio', { name: 'Suppliers' })).toHaveCount(0);
    await page.goto(`/contacts/suppliers/${encodeURIComponent(SUPPLIER)}`);
    await expect(page.getByText('No contacts for your role')).toBeVisible();
  });

  test('shows the contacts in Arabic, right to left', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/contacts');
    await toArabic(page);
    await expectHeading(page, 'العملاء والمورّدون');
    await expect(page.getByRole('radio', { name: 'المورّدون' })).toBeVisible();
    await expect(page.locator('app-person-card').first()).toContainText('المتبقي');
  });
});

test('works through a customer from the contacts table @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/contacts');
  await expectHeading(page, 'Customers & suppliers');
  await page.locator('app-search-field input').fill(CUSTOMER);
  const row = page.locator('app-data-table tbody tr').filter({ hasText: CUSTOMER }).first();
  await expect(row).toContainText('ILS');
  await row.click();
  const panel = page.locator('section.panel');
  await expect(panel.getByRole('heading', { name: CUSTOMER })).toBeVisible();
  await expect(panel).toContainText('059-000-0142');
  await expect(panel.getByRole('button', { name: named('Sell to', 'Lina') })).toBeVisible();
  await panel.getByRole('button', { name: 'Open contact' }).click();
  await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/);
});
