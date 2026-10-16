import { expect, test } from '@playwright/test';
import { CUSTOMER, ITEM, MAIN, choose, expectHeading, named, runId, signIn } from './support';

test('sells to a walk-in customer for cash and shows the receipt @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales/new');
  await expectHeading(page, 'New sale');
  await page.getByRole('button', { name: 'Walk-in customer' }).click();
  await expect(page).toHaveURL(/\/sales\/new\/items$/);
  await choose(page.locator('app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page
    .getByRole('button', { name: named('Add', ITEM.name) })
    .first()
    .click();
  await page.getByRole('button', { name: /^Review basket/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/basket$/);
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/\/sales\/new\/review$/);
  await page.getByRole('button', { name: /^Confirm sale/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  await expectHeading(page, 'Sale confirmed');
  await expect(page.locator('app-status-chip', { hasText: 'Payment: Paid' })).toBeVisible();
  const subtitle = await page.locator('app-page-heading p').first().innerText();
  const invoice = subtitle
    .split(' · ')[0]
    .replace(/[\u2066-\u2069]/g, '')
    .trim();

  // The sale is on the Sales page, as it was made: paid, delivered, for the planter's price.
  await page.getByRole('link', { name: 'Sales' }).click();
  await expectHeading(page, 'Sales');
  await page.locator('app-search-field input').fill(invoice);
  const card = page.locator('app-feedback-card', { hasText: invoice });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(named('Walk-in', 'Customer'));
  await expect(card).toContainText('Confirmed · Paid');
  await expect(card).toContainText('Goods delivered');
  await expect(card).toContainText('ILS 45.00');
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/sales/invoices/${invoice}$`));
});

test('lists sales orders and quotations on the sales workspace @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales');
  await expect(page.locator('app-data-table tbody tr').first()).toContainText('SINV');
  await page.getByRole('radio', { name: 'Orders' }).click();
  await expect(page.locator('app-data-table tbody tr').first()).toContainText('ORD');
  await page.getByRole('radio', { name: 'Quotes' }).click();
  await expect(page.locator('app-data-table')).toBeVisible();
  await page.getByRole('button', { name: 'Quick sale' }).click();
  await expect(page).toHaveURL(/\/sales\/new$/);
});

test.describe.serial('selling on account, then collecting @desktop', () => {
  let invoice = '';
  const row = (page: import('@playwright/test').Page) =>
    page.locator('app-data-table tbody tr').filter({ hasText: invoice });

  test('sells to a named customer, unpaid', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/sales/new');
    await page.locator('app-search-field input').fill(CUSTOMER);
    await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
    await page.getByRole('button', { name: /^Continue with/ }).click();
    await expect(page).toHaveURL(/\/sales\/new\/items$/);
    await choose(page.locator('section.panel app-select-field select').first(), MAIN);
    await page.locator('app-search-field input').fill(ITEM.code);
    await page
      .locator('app-catalog-table button.row')
      .filter({ hasText: ITEM.code })
      .first()
      .click();
    await expect(page.locator('section.panel')).toContainText(ITEM.name);
    await page.getByRole('button', { name: 'Review & payment' }).click();
    await expect(page).toHaveURL(/\/sales\/new\/review$/);
    await choose(page.locator('app-select-field select').first(), 'Unpaid');
    await page.getByRole('button', { name: /^Confirm sale/ }).click();
    await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
    await expectHeading(page, 'Sale confirmed');
    const subtitle = await page.locator('app-page-heading p').first().innerText();
    invoice = subtitle
      .split(' · ')[0]
      .replace(/[\u2066-\u2069]/g, '')
      .trim();

    // On the Sales workspace it reads as owed in full.
    await page.goto('/sales');
    await page.locator('app-search-field input').fill(invoice);
    await expect(row(page)).toContainText(CUSTOMER);
    await expect(row(page)).toContainText('Confirmed · Unpaid');
    await expect(row(page)).toContainText(named('ILS 45.00', 'due'));
  });

  test("collects the customer's payment", async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/money/receive');
    await expectHeading(page, 'Receive customer payment');
    await page.locator('app-search-field input').fill(CUSTOMER);
    await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
    await expect(page.getByText('Loading unpaid invoices…')).toHaveCount(0);
    await page.getByRole('button', { name: 'Review payment' }).click();
    await expect(page).toHaveURL(/\/money\/receive\/review$/);
    await page.getByRole('button', { name: /^Confirm receipt/ }).click();
    await expect(page).toHaveURL(/\/money\/receive\/recorded$/, { timeout: 60_000 });
    await expectHeading(page, 'Collection recorded');

    // One invoice settled opens that invoice; several open the payment history.
    await page.getByRole('button', { name: /^(View invoice|View payment history)/ }).click();
    await expect(page).toHaveURL(/\/sales\/invoices\/[^/]+$|\/money$/);

    // The collection settled the invoice: Sales now reads it as paid.
    await page.goto('/sales');
    await page.locator('app-search-field input').fill(invoice);
    await expect(row(page)).toContainText('Confirmed · Paid');
  });
});

test('adds a new customer while selling, and carries on with the sale @phone', async ({ page }) => {
  const name = `E2E Customer ${runId()}`;
  await signIn(page, 'owner');
  await page.goto('/sales/new');
  await page.getByRole('button', { name: '+ Add customer' }).click();
  await expectHeading(page, 'Add customer');
  await page.getByLabel('Customer name *').fill(name);
  await page.getByLabel('Phone').fill('059-000-9999');
  await page.getByRole('button', { name: 'Save & return to sale' }).click();
  await expect(page).toHaveURL(/\/sales\/new\/items$/, { timeout: 30_000 });
  await expect(page.locator('app-page-heading')).toContainText(name);
});
