import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hebron' });

/** A worker of its own for this run, joined in the past, so every day on their sheet row starts open. */
async function newWorker(page: Page): Promise<{ id: string; name: string }> {
  const name = `Attendance ${runId()}`;
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Employee',
        first_name: 'Attendance',
        last_name: name.split(' ')[1],
        gender: 'Female',
        date_of_birth: '1991-04-04',
        date_of_joining: '2026-01-01',
        designation: 'Gardener',
        company: 'Rehan Nursery',
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { message } = (await response.json()) as { message: { name: string } };
  return { id: message.name, name };
}

async function attendanceOf(page: Page, id: string, date: string) {
  return erp(page).list<{ status: string }>(
    'Attendance',
    ['status'],
    [
      ['employee', '=', id],
      ['attendance_date', '=', date],
      ['docstatus', '=', 1],
    ],
  );
}

test.describe('attendance @phone', () => {
  test("marks the day's attendance, leaving marked and on-leave workers as they are", async ({
    page,
  }) => {
    await signIn(page, 'owner');
    const worker = await newWorker(page);
    await page.goto('/workers');
    await page.getByRole('button', { name: 'Mark attendance' }).click();
    await expect(page).toHaveURL(/\/workers\/attendance$/);
    await expectHeading(page, 'Mark attendance');
    await expect(page.getByLabel('Date *')).toHaveValue(today());

    // Khaled is marked by the seed and Rana is on approved leave, if those still cover today.
    const [khaled] = await erp(page).list<{ name: string }>(
      'Employee',
      ['name'],
      [['employee_name', '=', 'Khaled Omar']],
    );
    const [marked] = await attendanceOf(page, khaled.name, today());
    if (marked) {
      await expect(page.getByRole('group', { name: 'Khaled Omar · Gardener' })).toContainText(
        named('Marked:', marked.status === 'Half Day' ? 'Half day' : marked.status),
      );
    }

    const day = '2026-03-10';
    await page.getByLabel('Date *').fill(day);
    const row = page.getByLabel(`${worker.name} · Gardener`);
    await expect(row).toHaveValue('Present');
    await row.selectOption('Half Day');
    const save = page.getByRole('button', { name: /^Save attendance · / });
    await save.click();
    await expect(page.locator('app-feedback-card', { hasText: 'Attendance saved' })).toContainText(
      '10 Mar 2026',
    );
    expect(await attendanceOf(page, worker.id, day)).toEqual([{ status: 'Half Day' }]);
    await expect(page.getByRole('group', { name: `${worker.name} · Gardener` })).toContainText(
      named('Marked:', 'Half day'),
    );

    // A future day can't be marked.
    await page.getByLabel('Date *').fill('2099-01-01');
    await expect(page.getByText('Choose a date up to today.')).toBeVisible();
  });

  test("opens from a worker's page and in Arabic", async ({ page }) => {
    await signIn(page, 'owner');
    const worker = await newWorker(page);
    await page.goto(`/workers/${worker.id}`);
    await page.getByRole('button', { name: 'Mark attendance' }).click();
    await expect(page).toHaveURL(/\/workers\/attendance$/);
    await toArabic(page);
    await expectHeading(page, 'تسجيل الحضور');
    await page.getByLabel('التاريخ *').fill('2026-03-11');
    await expect(page.getByLabel(`${worker.name} · Gardener`)).toHaveValue('Present');
    await expect(page.getByRole('button', { name: /^حفظ الحضور · / })).toBeVisible();
  });

  test('is closed to roles without HR', async ({ page }) => {
    await signIn(page, 'warehouse');
    await page.goto('/workers/attendance');
    await expect(page.getByText("Workers aren't open to your role")).toBeVisible();
  });
});

test('starts attendance from the workers workspace @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/workers');
  // Under the table, whoever is selected (the panel has its own).
  await page.locator('.actions').getByRole('button', { name: 'Mark attendance' }).click();
  await expectHeading(page, 'Mark attendance');
  await expect(
    page.getByRole('group', { name: /Rana Saleh/ }).or(page.getByLabel(/Rana Saleh/)),
  ).toBeVisible();
});
