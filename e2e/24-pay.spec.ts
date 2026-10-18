import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

async function newWorker(page: Page): Promise<{ id: string; name: string }> {
  const last = runId();
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Employee',
        first_name: 'Pay',
        last_name: last,
        gender: 'Female',
        date_of_birth: '1990-06-06',
        date_of_joining: '2026-01-01',
        company: 'Rehan Nursery',
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return {
    id: ((await response.json()) as { message: { name: string } }).message.name,
    name: `Pay ${last}`,
  };
}

/** The first day of last month, by the site's clock. */
const lastMonth = () => {
  const [y, m] = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Hebron' })
    .split('-')
    .map(Number);
  const date = new Date(Date.UTC(y, m - 2, 1));
  return date.toISOString().slice(0, 10);
};

test.describe('pay @phone', () => {
  test('sets a salary, makes and confirms the month’s slip', async ({ page }) => {
    await signIn(page, 'owner');
    const worker = await newWorker(page);
    const month = lastMonth();
    await page.goto(`/workers/${worker.id}`);
    await page.getByRole('button', { name: 'Set salary' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/salary/new\\?worker=${worker.id}$`));
    await expectHeading(page, 'Set salary');
    await page.getByLabel('Monthly salary *').fill('3000');
    await page.getByLabel('From *').fill(month);
    await page.getByRole('button', { name: 'Save salary' }).click();

    await expect(page).toHaveURL(/\/workers\/pay$/);
    const label = new Date(`${month}T00:00:00`).toLocaleString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
    await page.getByRole('radio', { name: label }).click();
    await expectHeading(page, named('Pay ·', label));
    const card = page.locator('app-person-card', { hasText: worker.name });
    await expect(card).toContainText('No slip yet');
    await page.getByRole('button', { name: /^Create .+ salary slips?$/ }).click();
    await expect(card).toContainText(named('Gross', 'ILS 3,000.00', '· Net'));
    await expect(card).toContainText('Draft slip');
    await page.getByRole('button', { name: /^Confirm .+ draft slips?$/ }).click();
    await expect(card).toContainText('Confirmed');

    const [slip] = await erp(page).list<{
      docstatus: number;
      gross_pay: number;
      start_date: string;
    }>('Salary Slip', ['docstatus', 'gross_pay', 'start_date'], [['employee', '=', worker.id]]);
    expect(slip).toMatchObject({ docstatus: 1, gross_pay: 3000, start_date: month });
  });

  test('sends a worker without a salary to set one, and shows pay in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    const worker = await newWorker(page);
    await page.goto('/workers');
    await page.getByRole('button', { name: 'Pay', exact: true }).click();
    await expect(page).toHaveURL(/\/workers\/pay$/);
    const card = page.locator('app-person-card', { hasText: worker.name });
    await expect(card).toContainText('No salary set');
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/workers/salary/new\\?worker=${worker.id}$`));
    await page.goto('/workers/pay');
    await toArabic(page);
    await expect(page.locator('app-person-card', { hasText: worker.name })).toContainText(
      'لا يوجد راتب محدد',
    );
  });
});
