import { Page, expect, test } from '@playwright/test';
import {
  CUSTOMER,
  ITEM,
  MAIN,
  choose,
  erp,
  expectHeading,
  ils,
  named,
  plain,
  runId,
  signIn,
  toArabic,
  topUp,
} from './support';

async function createProject(page: Page, title: string, customer: string | null): Promise<string> {
  const response = await page.request.post('/api/resource/Project', {
    data: {
      project_name: title,
      company: 'Rehan Nursery',
      status: 'Open',
      project_type: customer ? 'External' : 'Internal',
      ...(customer ? { customer } : {}),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { data: { name: string } }).data.name;
}

async function customerId(page: Page): Promise<string> {
  const [row] = await erp(page).list<{ name: string }>(
    'Customer',
    ['name'],
    [['customer_name', '=', CUSTOMER]],
  );
  return row.name;
}

test.describe.serial('selling to a customer project on a phone @phone', () => {
  const title = `E2E sell ${runId()}`;
  let project = '';
  let invoice = '';

  test('sells from the project page, billed to the project', async ({ page }) => {
    await signIn(page, 'owner');
    await topUp(page, ITEM.code, MAIN, 20);
    project = await createProject(page, title, await customerId(page));
    await page.goto(`/projects/${project}`);
    await expectHeading(page, title);

    const sell = page.locator('app-project-sell');
    await expect(sell).toContainText('Sell to this project');
    await expect(sell).toContainText(named('Customer:', CUSTOMER, '· billed to this project'));
    await expect(page.getByRole('button', { name: 'Sell to this project' })).toHaveCount(0);
    await expect(sell.getByRole('button')).toHaveText(['Quick sale']);
    await sell.getByRole('button', { name: 'Quick sale' }).click();

    await expect(page).toHaveURL(/\/sales\/new\/items/);
    await expect(page.getByText(named('Project:', title))).toBeVisible();
    await expect(page.locator('app-page-heading')).toContainText(CUSTOMER);
    await choose(page.locator('app-select-field select').first(), MAIN);
    await page.locator('app-search-field input').fill(ITEM.code);
    await page
      .getByRole('button', { name: named('Add', ITEM.name) })
      .first()
      .click();
    await page.getByRole('button', { name: /^Review basket/ }).click();
    await expect(page).toHaveURL(/\/sales\/new\/basket$/);
    await expect(page.getByText(named('Project:', title))).toBeVisible();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page).toHaveURL(/\/sales\/new\/review$/);
    await expect(page.getByText(named('Project:', title))).toBeVisible();
    await page.getByRole('button', { name: /^Confirm sale/ }).click();
    await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
    await expectHeading(page, 'Sale confirmed');
    invoice = plain((await page.locator('app-page-heading p').first().innerText()).split(' · ')[0]);

    const doc = await erp(page).doc<{
      project: string;
      customer: string;
      items: { project: string }[];
    }>('Sales Invoice', invoice);
    expect(doc.project).toBe(project);
    expect(doc.customer).toBe(await customerId(page));
    expect(doc.items.every((row) => row.project === project)).toBe(true);
  });

  test('lists the sale on the project page with the billed total', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/projects/${project}`);
    const sales = page.locator('app-record-links', { hasText: 'Sales for this project' });
    await expect(sales).toContainText(named(invoice, '·', ils(45), '·', 'Paid'));
    await expect(page.getByText(named('Billed', ils(45)))).toBeVisible();
    await sales.getByRole('button', { name: named(invoice) }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/invoices/${invoice}$`));
  });

  test('keeps the customer fixed: the customer step goes straight on', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/projects/${project}`);
    await page.locator('app-project-sell').getByRole('button', { name: 'Quick sale' }).click();
    await expect(page).toHaveURL(/\/sales\/new\/items/);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project}$`));
  });

  test('says an internal project has no customer to sell to', async ({ page }) => {
    await signIn(page, 'owner');
    const internal = await createProject(page, `E2E internal ${runId()}`, null);
    await page.goto(`/projects/${internal}`);
    const sell = page.locator('app-project-sell');
    await expect(sell).toContainText(
      "This project has no customer, so there's nothing to sell to. Supply it from stock, or add a customer to sell to it.",
    );
    await expect(sell.getByRole('button', { name: 'Quick sale' })).toHaveCount(0);
    await sell.getByRole('button', { name: 'Add customer' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${internal}/edit$`));
  });
});

test.describe.serial('selling to a customer project on the desktop @desktop', () => {
  const title = `E2E sell desk ${runId()}`;
  let project = '';

  test('saves a draft billed to the project and reopens it with the project', async ({ page }) => {
    await signIn(page, 'owner');
    await topUp(page, ITEM.code, MAIN, 20);
    project = await createProject(page, title, await customerId(page));
    await page.goto(`/projects/${project}`);
    await page.locator('app-project-sell').getByRole('button', { name: 'Quick sale' }).click();
    await expect(page).toHaveURL(/\/sales\/new\/items/);
    await expect(page.getByText(named('Project:', title))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add customer' })).toHaveCount(0);
    await choose(page.locator('section.panel app-select-field select').first(), MAIN);
    await page.locator('app-search-field input').fill(ITEM.code);
    await page
      .locator('app-catalog-table button.row')
      .filter({ hasText: ITEM.code })
      .first()
      .click();
    await expect(page.locator('section.panel')).toContainText(ITEM.name);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved')).toBeVisible();

    const [draft] = await erp(page).list<{ name: string; project: string }>(
      'Sales Invoice',
      ['name', 'project'],
      [
        ['project', '=', project],
        ['docstatus', '=', 0],
      ],
    );
    expect(draft.project).toBe(project);

    await page.goto(`/sales/new/basket?draft=${draft.name}`);
    await expect(page.getByText(named('Project:', title))).toBeVisible();
  });

  test('says nothing has been sold to a project with only a draft', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/projects/${project}`);
    await expect(page.locator('app-project-sell')).toContainText('Sell to this project');
    await expect(
      page.locator('app-record-links', { hasText: 'Sales for this project' }),
    ).toContainText('Nothing has been sold');
  });

  test('is in Arabic too', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(`/projects/${project}`);
    await toArabic(page);
    const sell = page.locator('app-project-sell');
    await expect(sell).toContainText('البيع لهذا المشروع');
    await expect(sell).toContainText('تُسجَّل على هذا المشروع');
    await expect(sell.getByRole('button', { name: 'بيع سريع' })).toBeVisible();
    await expect(page.getByText('مبيعات هذا المشروع')).toBeVisible();
  });
});
