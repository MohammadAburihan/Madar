import { Page, expect, test } from '@playwright/test';
import { CUSTOMER, ITEM, MAIN, choose, expectHeading, named, signIn } from './support';

/** A quick sale of one planter to the customer, left unpaid; resolves to its invoice. */
async function unpaidSale(page: Page): Promise<string> {
  await page.goto('/sales/new');
  await page.locator('app-search-field input').fill(CUSTOMER);
  await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
  await page.getByRole('button', { name: /^Continue with/ }).click();
  await choose(page.locator('section.panel app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page.locator('app-catalog-table button.row').filter({ hasText: ITEM.code }).first().click();
  await expect(page.locator('section.panel')).toContainText(ITEM.name);
  await page.getByRole('button', { name: 'Review & payment' }).click();
  await choose(page.locator('app-select-field select').first(), 'Unpaid');
  await page.getByRole('button', { name: /^Confirm sale/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  const subtitle = await page.locator('app-page-heading p').first().innerText();
  return subtitle.split(' · ')[0].replace(/[⁦-⁩]/g, '').trim();
}

test.describe.serial('taking a return against a sale @desktop', () => {
  let invoice = '';

  test('returns the planter, crediting what the customer owes', async ({ page }) => {
    await signIn(page, 'owner');
    invoice = await unpaidSale(page);
    await page.goto(`/sales/invoices/${invoice}`);
    await page.getByRole('button', { name: 'Return items' }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/invoices/${invoice}/return$`));
    await expectHeading(page, 'Return from sale');
    await expect(page.locator('app-page-heading')).toContainText(
      named('Original invoice', invoice, '·', CUSTOMER),
    );
    const line = page.locator('app-item-card', { hasText: ITEM.name });
    await expect(line).toContainText(named('Sold', '1', '· Returned', '0'));
    await expect(line).toContainText(named('Return', '1', '×', 'ILS 45.00'));
    await expect(page.getByLabel('Return quantity')).toHaveValue('1');
    await choose(page.getByLabel('Return to warehouse'), MAIN);
    await page.getByLabel('Reason').fill('Customer changed order');
    await expect(page.locator('app-feedback-card', { hasText: 'Return summary' })).toContainText(
      named(
        'Credit',
        'ILS 45.00',
        'and return',
        `1 × ${ITEM.name}`,
        'to stock. Original payment stays',
        'ILS 0.00',
        '. New outstanding balance:',
        'ILS 0.00',
      ),
    );
    await expect(page.getByText('No cash refund in this return.')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm return' }).click();
    await expect(page).toHaveURL(/\/return\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Sales return posted');
    const card = page.locator('app-feedback-card').first();
    await expect(card).toContainText(named('Credit posted ·', 'ILS 45.00'));
    await expect(card).toContainText(named(`1 × ${ITEM.name}`, 'returned to', MAIN));
    await expect(card).toContainText(named('Due reduced', '45.00', '→', '0.00'));

    await page.getByRole('button', { name: 'View original sale' }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/invoices/${invoice}$`));
  });

  test('has nothing left to return once everything came back', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/sales/invoices/${invoice}/return`);
    await expect(page.getByText('Nothing left to return')).toBeVisible();
    await page.goto('/sales');
    await page.locator('app-search-field input').fill(invoice);
    await expect(
      page.locator('app-data-table tbody tr').filter({ hasText: invoice }),
    ).toContainText('Credit note issued');
  });
});
