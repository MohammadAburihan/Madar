import { expect, test } from '@playwright/test';
import { expectHeading, heading, signIn, toArabic } from './support';

test('the owner signs in to Home and switches to Arabic @phone @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await expect(page).toHaveURL(/\/$/);
  await expect(heading(page)).toContainText('Rehan');
  await toArabic(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});

test('the More tab opens every other area on a phone @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.getByRole('link', { name: 'More' }).click();
  await expectHeading(page, 'More');
  for (const [label, path, title] of [
    ['Purchases', /\/purchases$/, /Purchas/],
    ['Money', /\/money$/, /Payments/],
    ['Projects', /\/projects$/, /Projects/],
    ['Reports', /\/reports$/, 'Reports'],
  ] as const) {
    await page.goto('/more');
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(heading(page)).toHaveText(title);
  }
});

test('each role sees only its areas in the sidebar @desktop', async ({ page }) => {
  const nav = page.getByRole('navigation').first();
  await signIn(page, 'salesperson');
  await expect(nav.getByRole('link', { name: 'Sales' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Purchases' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Reports' })).toHaveCount(0);
});

test("warns when the business's time zone can't be read, then says what it means once it is @phone @desktop", async ({
  page,
}) => {
  await page.route('**/frappe.client.get_time_zone*', (route) => route.abort());
  await signIn(page, 'owner');
  const warning = page.getByText("The business's time zone couldn't be read");
  await expect(warning).toBeVisible();
  await page.unroute('**/frappe.client.get_time_zone*');
  await page.getByRole('button', { name: 'Try again' }).click();
  // Read now, but the page's dates came from the device: it says so rather than hiding the problem.
  const recovered = page.getByText("The business's time zone is read");
  await expect(recovered).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'time zone is read' })).toHaveCount(1);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(recovered).toHaveCount(0);
  await expect(warning).toHaveCount(0);
});
