import { Page, expect, test } from '@playwright/test';
import { expectHeading, runId, signIn, toArabic } from './support';

const COUNT = 55;
const numbered = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0'));

/** Inserts the documents in one call through the signed-in session, as a business would have them already. */
async function seed(page: Page, docs: Record<string, unknown>[]): Promise<void> {
  const response = await page.request.post('/api/method/frappe.client.insert_many', {
    data: { docs },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

const services = (id: string) =>
  numbered(COUNT).map((n) => ({
    doctype: 'Item',
    item_code: `PG${id}-${n}`,
    item_name: `Paging item ${id} ${n}`,
    item_group: 'Services',
    stock_uom: 'Unit',
    is_stock_item: 0,
  }));

const customers = (id: string) =>
  numbered(COUNT).map((n) => ({
    doctype: 'Customer',
    customer_name: `Paging ${id} ${n}`,
    customer_type: 'Individual',
    customer_group: 'Individual',
    territory: 'All Territories',
  }));

test.describe('lists load 50 at a time @phone', () => {
  test('the catalog shows 50 items, and the next 5 when the end scrolls into view', async ({
    page,
  }) => {
    const id = runId();
    await signIn(page, 'owner');
    await seed(page, services(id));
    await page.goto('/catalog');
    await expectHeading(page, 'Items & services');
    await page.locator('app-search-field input').fill(`PG${id}`);
    const cards = page.locator('app-item-card', { hasText: `Paging item ${id}` });
    await expect(cards).toHaveCount(50);

    await page.locator('app-load-more').scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(COUNT);
    await expect(page.locator('app-load-more')).toBeEmpty();
  });

  test('the Show more button loads the next page, with its Arabic label', async ({ page }) => {
    const id = runId();
    await signIn(page, 'owner');
    await seed(page, services(id));
    await page.goto('/catalog');
    await page.locator('app-search-field input').fill(`PG${id}`);
    const cards = page.locator('app-item-card', { hasText: `Paging item ${id}` });
    await expect(cards).toHaveCount(50);

    await toArabic(page);
    const more = page.getByRole('button', { name: 'عرض المزيد' });
    await expect(more).toBeVisible();
    await more.click();
    await expect(cards).toHaveCount(COUNT);
    await expect(more).toHaveCount(0);
  });

  test('customers show 50 at a time too', async ({ page }) => {
    const id = runId();
    await signIn(page, 'owner');
    await seed(page, customers(id));
    await page.goto('/contacts');
    await page.locator('app-search-field input').fill(`Paging ${id}`);
    const cards = page.locator('app-person-card', { hasText: `Paging ${id}` });
    await expect(cards).toHaveCount(50);

    await page.getByRole('button', { name: 'Show more' }).click();
    await expect(cards).toHaveCount(COUNT);
  });
});

test.describe('tables load 50 at a time @desktop', () => {
  test('the catalog table ends with a Show more button', async ({ page }) => {
    const id = runId();
    await signIn(page, 'owner');
    await seed(page, services(id));
    await page.goto('/catalog');
    await page.locator('app-search-field input').fill(`PG${id}`);
    const rows = page.locator('app-data-table tbody tr', { hasText: `Paging item ${id}` });
    await expect(rows).toHaveCount(50);

    await page.getByRole('button', { name: 'Show more' }).click();
    await expect(rows).toHaveCount(COUNT);
  });
});
