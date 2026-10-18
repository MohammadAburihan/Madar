import { Page, expect, test } from '@playwright/test';
import { ITEM, choose, erp, expectHeading, named, signIn, toArabic, topUp } from './support';

const SHOP = 'Garden shop';

/** The item's quantity at a location by its display name, as ERPNext holds it. */
async function onHand(page: Page, warehouse: string): Promise<number> {
  const [target] = await erp(page).list<{ name: string }>(
    'Warehouse',
    ['name'],
    [['warehouse_name', '=', warehouse]],
  );
  const [bin] = await erp(page).list<{ actual_qty: number }>(
    'Bin',
    ['actual_qty'],
    [
      ['item_code', '=', ITEM.code],
      ['warehouse', '=', target.name],
    ],
  );
  return bin?.actual_qty ?? 0;
}

test.describe('stock counts and write-offs @phone', () => {
  test('counts an item at a location and posts the difference', async ({ page }) => {
    await signIn(page, 'warehouse');
    await page.goto(`/inventory/count?item=${ITEM.code}`);
    await expectHeading(page, 'Stock count');
    await choose(page.locator('app-select-field select').first(), SHOP);
    const before = await onHand(page, SHOP);
    await expect(page.locator('app-totals-card').first()).toContainText(
      named('System quantity', String(before), 'Unit'),
    );
    await page.locator('app-text-field input').first().fill(String(before));
    await expect(page.locator('app-feedback-card')).toContainText('Matches the system');
    await expect(page.getByRole('button', { name: 'Review count adjustment' })).toBeDisabled();
    await page
      .locator('app-text-field input')
      .first()
      .fill(String(before + 1));
    await expect(page.locator('app-feedback-card')).toContainText(
      named('Company stock will rise by', '1'),
    );
    await page.getByRole('button', { name: 'Review count adjustment' }).click();
    await expect(page).toHaveURL(/\/inventory\/count\/review$/);
    await expectHeading(page, 'Review stock count');
    await expect(page.locator('app-feedback-card')).toContainText(named('Count variance', '+1'));
    await page.getByRole('button', { name: 'Post count adjustment' }).click();
    await expect(page).toHaveURL(/\/inventory\/count\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Count adjustment posted');
    await expect(page.locator('app-feedback-card')).toContainText(
      named(SHOP, 'now holds', String(before + 1), 'Unit', 'of', ITEM.name),
    );
    expect(await onHand(page, SHOP)).toBe(before + 1);
    await page.getByRole('button', { name: 'Open stock' }).click();
    await expect(page).toHaveURL(new RegExp(`/inventory\\?item=${ITEM.code}$`));
  });

  test('writes off a damaged item with its reason', async ({ page }) => {
    await signIn(page, 'owner');
    await topUp(page, ITEM.code, SHOP, 2);
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'Record damage or loss' }).click();
    await expect(page).toHaveURL(/\/inventory\/damage/);
    await page.goto('/inventory/damage');
    await expectHeading(page, 'Damage or loss');
    await page.locator('app-search-field input').fill(ITEM.code);
    await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
    const selects = page.locator('app-select-field select');
    await choose(selects.nth(0), SHOP);
    await choose(selects.nth(1), 'Lost');
    const before = await onHand(page, SHOP);
    const fields = page.locator('app-text-field input');
    await fields.nth(0).fill('1');
    await expect(page.getByRole('button', { name: 'Review damage write-off' })).toBeDisabled();
    await fields.nth(1).fill('Broken pot, unsellable');
    await expect(page.locator('app-totals-card')).toContainText(named(SHOP, String(before), '→'));
    await page.getByRole('button', { name: 'Review damage write-off' }).click();
    await expect(page.locator('app-feedback-card')).toContainText(
      named('Write off', '1', 'Unit', '·', 'Lost'),
    );
    await page.getByRole('button', { name: 'Confirm damage write-off' }).click();
    await expect(page).toHaveURL(/\/inventory\/damage\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Damage write-off posted');
    expect(await onHand(page, SHOP)).toBe(before - 1);
    const [entry] = await erp(page).list<{ remarks: string }>(
      'Stock Entry',
      ['remarks'],
      [['remarks', 'like', '%Broken pot, unsellable%']],
      { order_by: 'creation desc', limit_page_length: 1 },
    );
    expect(entry.remarks).toMatch(/^Lost: Broken pot, unsellable\n\nMadar damage DMG-/);
  });

  test('shows the stock count in Arabic', async ({ page }) => {
    await signIn(page, 'warehouse');
    await page.goto(`/inventory/count?item=${ITEM.code}`);
    await toArabic(page);
    await expectHeading(page, 'جرد المخزون');
    await expect(page.locator('app-status-chip')).toContainText('تسوية الجرد');
    await expect(page.locator('app-totals-card').first()).toContainText('كمية النظام');
  });

  test('keeps counts from roles without stock access', async ({ page }) => {
    await signIn(page, 'salesperson');
    await page.goto('/inventory/count');
    await expect(page.locator('app-feedback-card')).toContainText("You can't adjust stock");
  });
});

test('starts a count for the selected item from the inventory workspace @desktop', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/inventory');
  await page.locator('app-data-table tbody tr').filter({ hasText: ITEM.code }).first().click();
  await page.getByRole('button', { name: 'Count stock' }).click();
  await expect(page).toHaveURL(new RegExp(`/inventory/count\\?item=${ITEM.code}$`));
  await expectHeading(page, 'Stock count');
  await expect(page.locator('app-item-card')).toContainText(ITEM.code);
  await page.goto('/new');
  await page.getByRole('button', { name: 'Record damage or loss' }).click();
  await expect(page).toHaveURL(/\/inventory\/damage$/);
});
