import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, runId, signIn, toArabic } from './support';

const partyId = (page: Page) => decodeURIComponent(page.url().split('/').pop()!);

const details = async (page: Page, doctype: 'Customer' | 'Supplier') =>
  (await erp(page).doc<Record<string, string | null>>(doctype, partyId(page)))[
    doctype === 'Customer' ? 'customer_details' : 'supplier_details'
  ] ?? '';

test.describe.serial('About on a customer @phone', () => {
  const name = `E2E About Customer ${runId()}`;
  let detail = '';

  test('adds a customer with About text and shows it on the contact page', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/contacts/new?type=customers');
    await expect(page.getByLabel('About (optional)')).toBeVisible();
    await expect(page.getByText('What they supply, or who they are')).toBeVisible();
    await page.getByLabel('Name *').fill(name);
    await page.getByLabel('About (optional)').fill('Landscaper in Ramallah\nBuys planters in bulk');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/, { timeout: 30_000 });
    detail = page.url();
    await expectHeading(page, name);
    const card = page.locator('app-about-card');
    await expect(card).toContainText('About');
    await expect(card).toContainText('Landscaper in Ramallah');
    await expect(card).toContainText('Buys planters in bulk');
    expect(await details(page, 'Customer')).toContain('Landscaper in Ramallah\nBuys planters');
  });

  test('editing loads the text, saves a change, and clearing it removes the block', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(detail);
    await page.getByRole('button', { name: 'Edit contact' }).click();
    await expect(page.getByLabel('About (optional)')).toHaveValue(
      'Landscaper in Ramallah\nBuys planters in bulk',
    );
    await page.getByLabel('About (optional)').fill('Garden designer');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(detail, { timeout: 30_000 });
    await expect(page.locator('app-about-card')).toContainText('Garden designer');
    await expect(page.locator('app-about-card')).not.toContainText('Landscaper');
    expect(await details(page, 'Customer')).toContain('Garden designer');

    await page.getByRole('button', { name: 'Edit contact' }).click();
    await page.getByLabel('About (optional)').fill('');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(detail, { timeout: 30_000 });
    await expect(page.locator('app-about-card')).toHaveCount(0);
    expect(await details(page, 'Customer')).not.toContain('Garden designer');
  });

  test('a customer without About shows no block', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(detail);
    await expectHeading(page, name);
    await expect(page.locator('app-about-card')).toHaveCount(0);
  });
});

test('adds and edits a supplier’s About on the desktop workspace @desktop', async ({ page }) => {
  const name = `E2E About Supplier ${runId()}`;
  await signIn(page, 'owner');
  await page.goto('/contacts?kind=suppliers');
  await page.getByRole('button', { name: '+ Add contact' }).click();
  await page.getByLabel('Name *').fill(name);
  await page.getByLabel('About (optional)').fill('Clay pots and glazes');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page).toHaveURL(/\/contacts\/suppliers\/[^/]+$/, { timeout: 30_000 });
  const detail = page.url();
  await expect(page.locator('app-about-card')).toContainText('Clay pots and glazes');
  expect(await details(page, 'Supplier')).toContain('Clay pots and glazes');

  await page.getByRole('button', { name: 'Edit supplier' }).click();
  await expect(page.getByLabel('About (optional)')).toHaveValue('Clay pots and glazes');
  await page.getByLabel('About (optional)').fill('Fertilizer and soil');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page).toHaveURL(detail, { timeout: 30_000 });
  await expect(page.locator('app-about-card')).toContainText('Fertilizer and soil');
  await expect(page.locator('app-about-card')).not.toContainText('Clay pots');
  expect(await details(page, 'Supplier')).toContain('Fertilizer and soil');
});

test('About reads in Arabic on the form and the contact page @phone', async ({ page }) => {
  const name = `E2E About AR ${runId()}`;
  await signIn(page, 'owner');
  await page.goto('/contacts/new?type=customers');
  await toArabic(page);
  await expect(page.getByLabel('نبذة (اختياري)')).toBeVisible();
  await expect(page.getByText('ما يوفّرونه، أو من هم')).toBeVisible();
  await page.getByLabel('الاسم *').fill(name);
  await page.getByLabel('نبذة (اختياري)').fill('مصمم حدائق في نابلس');
  await page.getByRole('button', { name: 'حفظ جهة الاتصال' }).click();
  await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/, { timeout: 30_000 });
  const card = page.locator('app-about-card');
  await expect(card).toContainText('نبذة');
  await expect(card).toContainText('مصمم حدائق في نابلس');
  expect(await details(page, 'Customer')).toContain('مصمم حدائق في نابلس');
});
