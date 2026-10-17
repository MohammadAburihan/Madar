import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

async function newWorker(page: Page): Promise<string> {
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Employee',
        first_name: 'Advance',
        last_name: runId(),
        gender: 'Male',
        date_of_birth: '1989-09-09',
        date_of_joining: '2026-01-01',
        company: 'Rehan Nursery',
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: { name: string } }).message.name;
}

test.describe('advances @phone', () => {
  test('gives a worker an advance from their page and shows what they owe back', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    const id = await newWorker(page);
    await page.goto(`/workers/${id}`);
    await page.getByRole('button', { name: 'Give an advance' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/advance/new\\?worker=${id}$`));
    await expectHeading(page, 'Give an advance');
    await expect(page.getByLabel('Worker *')).toHaveValue(id);
    await page.getByRole('button', { name: /^Pay advance/ }).click();
    await expect(page.getByText('Enter an amount above zero.')).toBeVisible();
    await page.getByLabel('Amount *').fill('250');
    await page.getByLabel('Paid from *').selectOption('Cash');
    await page.getByLabel('Purpose *').fill('Rent');
    await page.getByRole('button', { name: named('Pay advance ·', 'ILS 250.00') }).click();

    await expect(page).toHaveURL(new RegExp(`/workers/${id}$`));
    const totals = page.locator('app-totals-card');
    await expect(totals).toContainText('Advance to repay');
    await expect(totals).toContainText(named('ILS 250.00'));
    const [advance] = await erp(page).list<{
      status: string;
      paid_amount: number;
      purpose: string;
    }>('Employee Advance', ['status', 'paid_amount', 'purpose'], [['employee', '=', id]]);
    expect(advance).toMatchObject({ status: 'Paid', paid_amount: 250 });
    expect(advance.purpose).toMatch(/^Rent\n\nMadar advance ADV-/);
  });

  test('shows the advance form in Arabic, and keeps it from roles without it', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/workers/advance/new');
    await toArabic(page);
    await expectHeading(page, 'صرف سلفة');
    await page.getByRole('button', { name: /^صرف السلفة/ }).click();
    await expect(page.getByText('اختر العامل.')).toBeVisible();
  });

  test('is closed to roles without it', async ({ page }) => {
    await signIn(page, 'salesperson');
    await page.goto('/workers/advance/new');
    await expect(page.getByText("You can't give advances")).toBeVisible();
  });
});
