import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

async function newWorker(page: Page): Promise<string> {
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Employee',
        first_name: 'Shift',
        last_name: runId(),
        gender: 'Female',
        date_of_birth: '1993-03-03',
        date_of_joining: '2026-01-01',
        company: 'Rehan Nursery',
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: { name: string } }).message.name;
}

test.describe('shifts @phone', () => {
  test("assigns a shift from a worker's page, then refuses an overlapping one", async ({
    page,
  }) => {
    await signIn(page, 'owner');
    const id = await newWorker(page);
    await page.goto(`/workers/${id}`);
    await expect(page.getByText('No shift assigned')).toBeVisible();
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/shift/new\\?worker=${id}$`));
    await expectHeading(page, 'Assign shift');
    await expect(page.getByLabel('Worker *')).toHaveValue(id);
    await page.getByLabel('Shift *').selectOption('Evening');
    await page.getByLabel('From *').fill('2026-10-01');
    await page.getByRole('button', { name: 'Assign shift' }).click();

    await expect(page).toHaveURL(new RegExp(`/workers/${id}$`));
    await expect(page.getByText(named('Shift:', 'Evening · ', '13:00–21:00'))).toBeVisible();
    const [assignment] = await erp(page).list<{ shift_type: string; docstatus: number }>(
      'Shift Assignment',
      ['shift_type', 'docstatus', 'start_date'],
      [['employee', '=', id]],
    );
    expect(assignment).toMatchObject({ shift_type: 'Evening', docstatus: 1 });

    // A change from a later day ends the current shift the day before, and shows as the next shift.
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await page.getByLabel('Shift *').selectOption('Morning');
    await page.getByLabel('From *').fill('2099-01-05');
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${id}$`));
    await expect(
      page.getByText(named('From', '5 Jan 2099', ':', 'Morning · ', '07:00–15:00')),
    ).toBeVisible();
    const assignments = await erp(page).list<{ shift_type: string; end_date: string | null }>(
      'Shift Assignment',
      ['shift_type', 'end_date'],
      [['employee', '=', id]],
      { order_by: 'start_date asc' },
    );
    expect(assignments).toEqual([
      { shift_type: 'Evening', end_date: '2099-01-04' },
      { shift_type: 'Morning', end_date: null },
    ]);

    // One starting the same day as another can't be replaced: Frappe HR refuses the overlap.
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await page.getByLabel('Shift *').selectOption('Morning');
    await page.getByLabel('From *').fill('2099-01-05');
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await expect(page.getByText('The worker already has a shift then')).toBeVisible();
  });

  test('shows the shift form in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/workers/shift/new');
    await toArabic(page);
    await expectHeading(page, 'تعيين وردية');
    await page.getByRole('button', { name: 'تعيين الوردية' }).click();
    await expect(page.getByText('اختر العامل.')).toBeVisible();
  });
});

test('shows a worker’s shift on the desktop worker page @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  const [khaled] = await erp(page).list<{ name: string }>(
    'Employee',
    ['name'],
    [['employee_name', '=', 'Khaled Omar']],
  );
  await page.goto(`/workers/${khaled.name}`);
  await expect(page.getByText(named('Shift:', 'Morning · ', '07:00–15:00'))).toBeVisible();
});
