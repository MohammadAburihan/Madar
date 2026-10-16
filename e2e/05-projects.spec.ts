import { expect, test } from '@playwright/test';
import { ITEM, SUPPLIER, choose, expectHeading, named, runId, signIn } from './support';

// A project from creation to materials used and returned at its site.
test.describe.serial('running a project @phone', () => {
  const title = `E2E garden ${runId()}`;
  let project = '';

  test('creates an internal project', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/projects/new');
    await expectHeading(page, 'New project');
    await page.locator('app-text-field input').first().fill(title);
    await page.locator('app-select-field select').first().selectOption('internal');
    await page.locator('app-text-field input').nth(1).fill('2500');
    await page.getByRole('button', { name: 'Save project' }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/saved$/, { timeout: 60_000 });
    await expectHeading(page, 'Project saved');
    project = decodeURIComponent(page.url().split('/').at(-2)!);
    await page.getByRole('button', { name: 'Open project' }).click();
    await expectHeading(page, title);
  });

  test('adds a material requirement', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/projects/${project}/requirement`);
    await page.locator('app-search-field input').fill(ITEM.code);
    await page.locator('app-item-card').filter({ hasText: ITEM.code }).first().click();
    await page.locator('app-text-field input').first().fill('2');
    await page.getByRole('button', { name: 'Add requirement' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project}$`), { timeout: 60_000 });
    const requirement = page.locator('app-project-section', { hasText: 'Material requirement' });
    await expect(requirement).toContainText(ITEM.code);
  });

  test('supplies the project from stock', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/projects/${project}`);
    await page.getByRole('button', { name: 'Review materials and supply' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project}/supply/${ITEM.code}$`));
    await expectHeading(page, 'Materials & supply');
    await page.getByRole('button', { name: /^Review delivery/ }).click();
    await expect(page).toHaveURL(/\/supply\/[^/]+\/review$/);
    await page.getByRole('button', { name: /^Confirm delivery/ }).click();
    await expect(page).toHaveURL(/\/supply\/[^/]+\/done$/, { timeout: 60_000 });
    await expectHeading(page, 'Delivered to site');
    await page.getByRole('button', { name: 'Open project' }).click();
    const site = page.locator('app-project-section', { hasText: 'Materials at site' });
    await expect(site).toContainText(named('2', 'units', 'at site'));
  });

  test('records use at the site and returns what was left', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/projects/${project}/site/${ITEM.code}`);
    await expectHeading(page, 'Materials at site');
    await page.locator('app-text-field input').first().fill('1');
    await page.getByRole('button', { name: /^Confirm use of/ }).click();
    await expect(page).toHaveURL(/\/site\/[^/]+\/return$/, { timeout: 60_000 });
    await expectHeading(page, 'Usage recorded');
    await page.locator('app-text-field input').first().fill('1');
    await page.getByRole('button', { name: /^Confirm return of/ }).click();
    await expect(page).toHaveURL(/\/site\/[^/]+\/returned$/, { timeout: 60_000 });
    await expectHeading(page, 'Return posted');
    await expect(page.locator('app-status-chip').first()).toContainText(named('1', 'returned'));
  });

  test('buys for the project, the item filled in from its supply plan', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/purchases/new?project=${project}&item=${ITEM.code}&qty=3`);
    await choose(page.locator('app-select-field select').first(), SUPPLIER);
    await expect(page.getByText(named('Bought for project', project))).toBeVisible();
    await expect(page.locator('app-quantity-stepper').first()).toContainText('3');
    await expect(page.getByText(named('Price each', '·', ITEM.name))).toBeVisible();
    await page.getByRole('button', { name: 'Review purchase order' }).click();
    await page.getByRole('button', { name: 'Confirm purchase order' }).click();
    await expect(page).toHaveURL(/\/purchases\/order\/[^/]+$/, { timeout: 60_000 });
  });
});

test('shows a project as the desktop workspace, with its movements @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/projects');
  // The seeded project: it has deliveries to its site and a purchase order booked to it.
  await page.locator('button.card').filter({ hasText: 'Garden installation' }).first().click();
  await expect(page.getByRole('button', { name: 'Add update' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Site stock' })).toBeVisible();
  await expect(page.locator('section.ledger').first()).toContainText('Transfer to site');
  await expect(page.locator('app-record-links')).toContainText('Purchase');
});

test('updates a project from the desktop workspace @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/projects');
  await page.locator('button.card').filter({ hasText: 'Garden installation' }).first().click();
  await page.getByRole('button', { name: 'Add update' }).click();
  await expectHeading(page, 'Edit project');
  await expect(page.locator('app-text-field input').first()).toHaveValue('Garden installation');
  await page.locator('app-text-field input').nth(1).fill('5000');
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/saved$/, { timeout: 60_000 });
  await expectHeading(page, 'Project saved');
});
