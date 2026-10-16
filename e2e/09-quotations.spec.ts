import { expect, test } from '@playwright/test';
import { CUSTOMER, ITEM, expectHeading, named, signIn } from './support';

test.describe.serial('quoting a customer @phone', () => {
  let quotation = '';

  test('builds and confirms a quotation, then finds it on Sales', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/sales');
    await page.getByRole('button', { name: 'Create quotation' }).click();
    await expect(page).toHaveURL(/\/sales\/quote\/new$/);
    await expectHeading(page, 'New quotation');
    await page.getByLabel('Customer').fill(CUSTOMER);
    await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
    await page.getByLabel('Items').fill(ITEM.code);
    await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
    await page.getByRole('button', { name: named('One more', ITEM.name) }).click();
    // Two planters at the listed ILS 45.00.
    await expect(page.getByText(named('Quoted total', 'ILS 90.00'))).toBeVisible();
    await page.getByRole('button', { name: 'Confirm quotation' }).click();
    await expect(page).toHaveURL(/\/sales\/quotes\/[^/]+$/, { timeout: 60_000 });
    quotation = decodeURIComponent(page.url().split('/').pop()!);
    await expectHeading(page, 'Quotation confirmed');
    await expect(page.locator('app-page-heading')).toContainText(CUSTOMER);
    await expect(page.locator('app-feedback-card').first()).toContainText(
      named('Open', '·', 'ILS 90.00'),
    );
    await expect(page.locator('app-feedback-card').first()).toContainText(named('2 ×', ITEM.name));

    await page.getByRole('button', { name: 'Back to sales' }).click();
    await page.getByRole('radio', { name: 'Quotes' }).click();
    await page.locator('app-search-field input').fill(quotation);
    const card = page.locator('app-feedback-card', { hasText: quotation });
    await expect(card).toContainText(named('Open', '·', 'ILS 90.00'));
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/sales/quotes/${quotation}$`));
    await expectHeading(page, 'Quotation');
  });

  test('shares the quotation as a PDF', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/sales/quotes/${quotation}`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: 'Share quotation' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${quotation}.pdf`);
  });
});

test('saves a quotation as a draft to finish later @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales/quote/new');
  await page.getByLabel('Customer').fill(CUSTOMER);
  await page.locator('app-person-card').filter({ hasText: CUSTOMER }).first().click();
  await page.getByLabel('Items').fill(ITEM.code);
  await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
  // A price typed for a line that was then removed doesn't come back with the item.
  const price = page.getByLabel(named('Price each', '·', ITEM.name));
  await price.fill('50');
  await page.getByRole('button', { name: named('One fewer', ITEM.name) }).click();
  await page.getByLabel('Items').fill(ITEM.code);
  await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
  await expect(price).toHaveValue('45');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 });
  const heading = await page.locator('app-page-heading p').first().innerText();
  const draft = heading.match(/SAL-QTN-[\d-]+/)![0];

  // Later: the draft opens from Sales, is finished in the form and confirmed. A draft isn't shared.
  await page.goto('/sales');
  await page.getByRole('radio', { name: 'Quotes' }).click();
  await page.locator('app-search-field input').fill(draft);
  await page.locator('app-data-table tbody tr').filter({ hasText: draft }).click();
  await expect(page.getByRole('button', { name: 'Share quotation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await expect(page).toHaveURL(/\/sales\/quote\/new$/);
  await expect(price).toHaveValue('45');
  // Quoted free of charge: ERPNext must keep the 0, not fill in the list price.
  await price.fill('0');
  await page.getByRole('button', { name: 'Confirm quotation' }).click();
  await expect(page).toHaveURL(new RegExp(`/sales/quotes/${draft}$`), { timeout: 60_000 });
  await expectHeading(page, 'Quotation confirmed');
  await expect(page.locator('app-feedback-card').first()).toContainText(
    named('Open', '·', 'ILS 0.00'),
  );
});
