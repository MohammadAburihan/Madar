import { Page, expect, test } from '@playwright/test';
import { ITEM, choose, erp, expectHeading, named, signIn, toArabic } from './support';

const SHOP = 'Garden shop';

async function onHand(page: Page, item: string, warehouse: string): Promise<number> {
  const [target] = await erp(page).list<{ name: string }>(
    'Warehouse',
    ['name'],
    [['warehouse_name', '=', warehouse]],
  );
  const [bin] = await erp(page).list<{ actual_qty: number }>(
    'Bin',
    ['actual_qty'],
    [
      ['item_code', '=', item],
      ['warehouse', '=', target.name],
    ],
  );
  return bin?.actual_qty ?? 0;
}

async function addLine(page: Page, code: string) {
  await page.locator('app-search-field input').fill(code);
  await page.locator('app-item-card').filter({ hasText: code }).first().click();
}

test.describe('adding stock without buying it @phone', () => {
  test('adds opening stock of two items, one at a typed cost', async ({ page }) => {
    await signIn(page, 'owner');
    const planters = await onHand(page, ITEM.code, SHOP);
    const olives = await onHand(page, 'OLV-20', SHOP);
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'Add stock' }).click();
    await expect(page).toHaveURL(/\/inventory\/add/);
    await page.goto('/inventory/add');
    await expectHeading(page, 'Add stock');
    const selects = page.locator('app-select-field select');
    await choose(selects.nth(0), 'Opening stock');
    await choose(selects.nth(1), SHOP);
    await addLine(page, ITEM.code);
    await addLine(page, 'OLV-20');
    const lines = page.locator('.line');
    await lines
      .nth(0)
      .locator('app-text-field', { hasText: 'Quantity' })
      .locator('input')
      .fill('3');
    await lines
      .nth(0)
      .locator('app-text-field', { hasText: 'Cost per unit' })
      .locator('input')
      .fill('18');
    await lines
      .nth(1)
      .locator('app-text-field', { hasText: 'Quantity' })
      .locator('input')
      .fill('2');
    await expect(page.locator('app-feedback-card').last()).toContainText(
      named('Adds', '5', 'units at', SHOP),
    );
    await page.getByRole('button', { name: 'Review stock to add' }).click();
    await expect(page).toHaveURL(/\/inventory\/add\/review$/);
    await expect(page.locator('app-feedback-card')).toContainText(
      named('Add', '2', 'items ·', '5', 'units'),
    );
    await page.getByRole('button', { name: 'Add stock' }).click();
    await expect(page).toHaveURL(/\/inventory\/add\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Stock added');
    await expect(page.locator('app-feedback-card')).toContainText(named('now at', SHOP));
    expect(await onHand(page, ITEM.code, SHOP)).toBe(planters + 3);
    expect(await onHand(page, 'OLV-20', SHOP)).toBe(olives + 2);
    const [entry] = await erp(page).list<{ is_opening: string; remarks: string }>(
      'Stock Entry',
      ['is_opening', 'remarks'],
      [['remarks', 'like', '%Madar add ADD-%']],
      { order_by: 'creation desc', limit_page_length: 1 },
    );
    expect(entry).toMatchObject({ is_opening: 'Yes' });
    expect(entry.remarks).toMatch(/^Opening stock/);
  });

  test('lets the warehouse worker add stock grown here, without costs', async ({ page }) => {
    await signIn(page, 'warehouse');
    const before = await onHand(page, 'OLV-20', SHOP);
    await page.goto('/inventory/add');
    const selects = page.locator('app-select-field select');
    await choose(selects.nth(0), 'Grown or made here');
    await choose(selects.nth(1), SHOP);
    await addLine(page, 'OLV-20');
    await expect(page.locator('app-text-field', { hasText: 'Cost per unit' })).toHaveCount(0);
    await page.locator('.line app-text-field input').first().fill('4');
    await page.getByRole('button', { name: 'Review stock to add' }).click();
    await page.getByRole('button', { name: 'Add stock' }).click();
    await expect(page).toHaveURL(/\/inventory\/add\/done$/, { timeout: 60_000 });
    expect(await onHand(page, 'OLV-20', SHOP)).toBe(before + 4);
  });

  test('shows Add stock in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/inventory/add');
    await toArabic(page);
    await expectHeading(page, 'إضافة مخزون');
    await expect(page.locator('app-select-field select').first()).toContainText('مخزون افتتاحي');
  });

  test('keeps it from roles that can’t adjust stock', async ({ page }) => {
    await signIn(page, 'salesperson');
    await page.goto('/inventory/add');
    await expect(page.locator('app-feedback-card')).toContainText("You can't add stock");
  });
});

test('opens Add stock for the selected item from the inventory workspace @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/inventory');
  await page.locator('app-data-table tbody tr').filter({ hasText: ITEM.code }).first().click();
  await page.getByRole('button', { name: 'Add stock' }).click();
  await expect(page).toHaveURL(new RegExp(`/inventory/add\\?item=${ITEM.code}$`));
  await expect(page.locator('.line')).toContainText(ITEM.code);
});
