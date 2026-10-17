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

    // A change from a later day: the running shift is ended the day before first, then the new one assigned.
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await page.getByLabel('Shift *').selectOption('Morning');
    await page.getByLabel('From *').fill('2099-01-05');
    await expect(
      page.locator('app-feedback-card', { hasText: 'until further notice' }),
    ).toContainText(named('Evening · ', '13:00–21:00'));
    await expect(page.getByRole('button', { name: 'Assign shift' })).toHaveCount(0);
    await page.getByRole('button', { name: named('End', 'Evening', 'on', '4 Jan 2099') }).click();
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

    // One starting the same day as another can't be saved: it has to end before it.
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await page.getByLabel('Shift *').selectOption('Morning');
    await page.getByLabel('From *').fill('2099-01-05');
    await expect(page.getByText('Set Until to end the new shift before it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign shift' })).toHaveCount(0);
  });

  test('puts the regular shift back after a temporary one, and stops a shift running into a later one', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    const id = await newWorker(page);
    const assign = async (shift: string, from: string, until = '') => {
      await page.goto(`/workers/shift/new?worker=${id}`);
      await page.getByLabel('Shift *').selectOption(shift);
      await page.getByLabel('From *').fill(from);
      if (until) {
        await page.getByLabel('Until').fill(until);
      }
    };
    await assign('Morning', '2099-02-01');
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${id}$`));

    // A shift from before then, with no end, would run into Morning: it must end first.
    await assign('Evening', '2099-01-15');
    await expect(
      page.locator('app-feedback-card', { hasText: named('from', '1 Feb 2099') }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign shift' })).toHaveCount(0);

    // A temporary Evening: Morning ends the day before, then the form opens again to put it back.
    await assign('Evening', '2099-03-10', '2099-03-12');
    await page.getByRole('button', { name: named('End', 'Morning', 'on', '9 Mar 2099') }).click();
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await expect(page).toHaveURL(/shift=Morning&from=2099-03-13/);
    await expect(page.getByText(named('Put', 'Morning', 'back from', '13 Mar 2099'))).toBeVisible();
    await expect(page.getByLabel('Shift *')).toHaveValue('Morning');
    await page.getByRole('button', { name: 'Assign shift' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${id}$`));
    const assignments = await erp(page).list<{
      shift_type: string;
      start_date: string;
      end_date: string | null;
    }>('Shift Assignment', ['shift_type', 'start_date', 'end_date'], [['employee', '=', id]], {
      order_by: 'start_date asc',
    });
    expect(assignments).toEqual([
      { shift_type: 'Morning', start_date: '2099-02-01', end_date: '2099-03-09' },
      { shift_type: 'Evening', start_date: '2099-03-10', end_date: '2099-03-12' },
      { shift_type: 'Morning', start_date: '2099-03-13', end_date: null },
    ]);
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
