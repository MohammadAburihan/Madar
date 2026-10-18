import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

async function newWorker(page: Page): Promise<string> {
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Employee',
        first_name: 'Hours',
        last_name: runId(),
        gender: 'Male',
        date_of_birth: '1991-07-07',
        date_of_joining: '2026-01-01',
        company: 'Rehan Nursery',
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: { name: string } }).message.name;
}

test.describe('hours @phone', () => {
  test("logs a worker's hours on a project and shows the week's total", async ({ page }) => {
    await signIn(page, 'owner');
    const id = await newWorker(page);
    await page.goto(`/workers/${id}`);
    await page.getByRole('button', { name: 'Log hours' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/hours/new\\?worker=${id}$`));
    await expectHeading(page, 'Log hours');
    await page.getByRole('button', { name: 'Save hours' }).click();
    await expect(page.getByText('Enter hours between 0 and 24.')).toBeVisible();
    await page.getByLabel('Hours *').fill('6.5');
    await page.getByLabel('Activity').selectOption('Execution');
    await page.getByLabel('Project').selectOption({ label: 'Garden installation' });
    await page.getByLabel('Note').fill('Front beds');
    await page.getByRole('button', { name: 'Save hours' }).click();

    await expect(page).toHaveURL(new RegExp(`/workers/${id}$`));
    const totals = page.locator('app-totals-card');
    await expect(totals).toContainText('Hours in the last 7 days');
    await expect(totals).toContainText(named('6.5'));
    const [sheet] = await erp(page).list<{ docstatus: number; total_hours: number; note: string }>(
      'Timesheet',
      ['docstatus', 'total_hours', 'note'],
      [['employee', '=', id]],
    );
    expect(sheet).toMatchObject({ docstatus: 1, total_hours: 6.5 });
    expect(sheet.note).toContain('Madar hours TIME-');
  });

  test('shows the hours form in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/workers/hours/new');
    await toArabic(page);
    await expectHeading(page, 'تسجيل الساعات');
    await page.getByRole('button', { name: 'حفظ الساعات' }).click();
    await expect(page.getByText('اختر العامل.')).toBeVisible();
  });
});
