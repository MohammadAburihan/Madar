import { Page, expect, test } from '@playwright/test';
import { signIn, toArabic } from './support';

async function expectActionAboveSearch(page: Page, action: string | RegExp): Promise<void> {
  const button = page.getByRole('button', { name: action }).first();
  await expect(button).toBeVisible();
  const search = page.locator('app-search-field').first();
  await expect(search).toBeVisible();
  const box = await button.boundingBox();
  const searchBox = await search.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeLessThan(searchBox!.y);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

test.describe('list actions sit above the list on a phone @phone', () => {
  const screens: [string, string, string | RegExp][] = [
    ['Sales', '/sales', 'Quick sale'],
    ['Contacts', '/contacts', 'Add customer or supplier'],
    ['Items', '/catalog', 'Add item or service'],
    ['Workers', '/workers', 'Add worker'],
    ['Projects', '/projects', 'New project'],
    ['Inventory', '/inventory', 'Move stock'],
    ['Money', '/money', 'Receive payment'],
  ];

  for (const [name, path, action] of screens) {
    test(`${name} shows its main action before the search field`, async ({ page }) => {
      await signIn(page, 'owner');
      await page.goto(path);
      await expectActionAboveSearch(page, action);
    });
  }

  test('Sales in Arabic shows Quick sale before the search field', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/sales');
    await toArabic(page);
    await expectActionAboveSearch(page, 'بيع سريع');
  });
});
