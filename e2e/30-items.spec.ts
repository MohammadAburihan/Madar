import { expect, test } from '@playwright/test';
import { choose, erp, expectHeading, ils, named, runId, signIn, toArabic } from './support';

test.describe('items and services @phone', () => {
  const code = `E2E-POT-${runId()}`;

  test('adds a stocked product with its price, cost and barcode', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'Items & services' }).click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expectHeading(page, 'Items & services');
    await page.getByRole('button', { name: 'Add item or service' }).click();
    await expectHeading(page, 'Add item or service');
    const fields = page.locator('app-text-field input');
    await fields.nth(0).fill('E2E planter');
    await fields.nth(1).fill(code);
    await fields.nth(2).fill(`729${Date.now()}`.slice(0, 13));
    const selects = page.locator('app-select-field select');
    await choose(selects.nth(1), 'Products');
    await choose(selects.nth(2), 'Unit');
    await fields.nth(3).fill('45');
    await fields.nth(4).fill('22.5');
    await page.getByRole('button', { name: 'Save item' }).click();
    await expect(page).toHaveURL(new RegExp(`/catalog/${code}$`), { timeout: 60_000 });
    await expectHeading(page, 'E2E planter');
    await expect(page.locator('app-totals-card')).toContainText(named('Selling price', ils(45)));
    await expect(page.locator('app-totals-card')).toContainText(named('Buying cost', ils(22.5)));
    await expect(page.getByRole('heading', { name: 'Stock by warehouse' })).toBeVisible();
    const item = await erp(page).doc<{ is_stock_item: number; valuation_rate: number }>(
      'Item',
      code,
    );
    expect(item).toMatchObject({ is_stock_item: 1, valuation_rate: 22.5 });
  });

  test('changes the selling price from the edit form', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/catalog/${code}`);
    await page.getByRole('button', { name: 'Edit item' }).click();
    await expectHeading(page, 'Edit item');
    const price = page.locator('app-text-field', { hasText: 'Selling price' }).locator('input');
    await price.fill('49');
    await page.getByRole('button', { name: 'Save item' }).click();
    await expect(page).toHaveURL(new RegExp(`/catalog/${code}$`), { timeout: 60_000 });
    await expect(page.locator('app-totals-card')).toContainText(named('Selling price', ils(49)));
    await page.goto('/catalog');
    await page.locator('app-search-field input').fill(code);
    await expect(page.locator('app-item-card').filter({ hasText: code })).toContainText(
      named(ils(49), '·', '0', 'available'),
    );
  });

  test('adds a service without stock', async ({ page }) => {
    const service = `E2E-SRV-${runId()}`;
    await signIn(page, 'owner');
    await page.goto('/catalog/new');
    await choose(page.locator('app-select-field select').first(), 'Service');
    const fields = page.locator('app-text-field input');
    await fields.nth(0).fill('E2E pruning visit');
    await fields.nth(1).fill(service);
    const selects = page.locator('app-select-field select');
    await choose(selects.nth(1), 'Services');
    await choose(selects.nth(2), 'Unit');
    await fields.nth(2).fill('150');
    await expect(page.locator('app-feedback-card')).toContainText('No warehouse or stock quantity');
    await page.getByRole('button', { name: 'Save service' }).click();
    await expect(page).toHaveURL(new RegExp(`/catalog/${service}$`), { timeout: 60_000 });
    await expect(page.locator('app-page-heading')).toContainText(named(service, '·', 'Service'));
    await expect(page.getByRole('button', { name: 'Edit service' })).toBeVisible();
    const item = await erp(page).doc<{ is_stock_item: number }>('Item', service);
    expect(item.is_stock_item).toBe(0);
  });

  test("refuses a code that's already used", async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/catalog/new');
    const fields = page.locator('app-text-field input');
    await fields.nth(0).fill('Another olive');
    await fields.nth(1).fill('OLV-20');
    const selects = page.locator('app-select-field select');
    await choose(selects.nth(1), 'Products');
    await choose(selects.nth(2), 'Unit');
    await page.getByRole('button', { name: 'Save item' }).click();
    await expect(page.locator('app-feedback-card')).toContainText('That code is taken');
  });

  test('lets the purchasing officer add items but not set selling prices', async ({ page }) => {
    await signIn(page, 'purchasing');
    await page.goto('/catalog/new');
    await expect(page.locator('app-text-field', { hasText: 'Buying cost' })).toBeVisible();
    await expect(page.locator('app-text-field', { hasText: 'Selling price' })).toHaveCount(0);
  });

  test('shows the catalog to sellers without the add button', async ({ page }) => {
    await signIn(page, 'salesperson');
    await page.goto('/catalog');
    await page.getByRole('radio', { name: 'Services' }).click();
    await expect(page.locator('app-item-card').first()).toContainText('No stock tracking');
    await expect(page.getByRole('button', { name: 'Add item or service' })).toHaveCount(0);
  });

  test('shows the catalog in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/catalog');
    await toArabic(page);
    await expectHeading(page, 'الأصناف والخدمات');
    await expect(page.getByRole('radio', { name: 'الخدمات' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة صنف أو خدمة' })).toBeVisible();
  });
});

test('works through the catalog table and panel @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/catalog');
  await expect(page.locator('app-data-table th')).toHaveText([
    'Name / code',
    'Type / category',
    'Price',
  ]);
  await page.locator('app-search-field input').fill('OLV-20');
  await page.locator('app-data-table tbody tr').filter({ hasText: 'OLV-20' }).first().click();
  const panel = page.locator('section.panel');
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('Olive tree');
  await expect(panel.locator('app-totals-card')).toContainText('Selling price');
  await panel.getByRole('button', { name: 'Edit item' }).click();
  await expect(page).toHaveURL(/\/catalog\/OLV-20\/edit$/);
  await expectHeading(page, 'Edit item');
  await page.goto('/catalog');
  await page.getByRole('button', { name: '+ Add item' }).click();
  await expect(page).toHaveURL(/\/catalog\/new$/);
});
