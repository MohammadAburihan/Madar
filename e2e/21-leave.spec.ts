import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

const post = async <T>(page: Page, method: string, data: unknown): Promise<T> => {
  const response = await page.request.post(`/api/method/${method}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: T }).message;
};

/** A worker of this run with 10 days of Privilege Leave, so their requests never overlap earlier runs'. */
async function workerWithLeave(page: Page): Promise<{ id: string; name: string }> {
  const last = runId();
  const worker = await post<{ name: string }>(page, 'frappe.client.insert', {
    doc: {
      doctype: 'Employee',
      first_name: 'Leave',
      last_name: last,
      gender: 'Male',
      date_of_birth: '1990-02-02',
      date_of_joining: '2026-01-01',
      company: 'Rehan Nursery',
    },
  });
  const allocation = await post<Record<string, unknown>>(page, 'frappe.client.insert', {
    doc: {
      doctype: 'Leave Allocation',
      employee: worker.name,
      leave_type: 'Privilege Leave',
      from_date: '2026-01-01',
      to_date: '2026-12-31',
      new_leaves_allocated: 10,
    },
  });
  await post(page, 'frappe.client.submit', { doc: allocation });
  return { id: worker.name, name: `Leave ${last}` };
}

async function leaveOf(page: Page, id: string) {
  return erp(page).doc<{ status: string; docstatus: number; total_leave_days: number }>(
    'Leave Application',
    id,
  );
}

test.describe('leave @phone', () => {
  test("requests leave from a worker's page and approves it", async ({ page }) => {
    await signIn(page, 'owner');
    const worker = await workerWithLeave(page);
    await page.goto(`/workers/${worker.id}`);
    await page.getByRole('button', { name: 'Request leave' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/leave/new\\?worker=${worker.id}$`));
    await expectHeading(page, 'Request leave');
    await expect(page.getByLabel('Worker *')).toHaveValue(worker.id);
    // The only allocated type is chosen, with its balance.
    await expect(page.getByLabel('Leave type *')).toHaveValue('Privilege Leave');
    await expect(page.getByLabel('Leave type *').locator('option:checked')).toHaveText(
      named('Privilege Leave', '·', '10', 'days', 'left'),
    );
    await page.getByLabel('From *').fill('2026-11-16');
    await page.getByLabel('To *').fill('2026-11-18');
    await page.getByLabel('Reason').fill('Family visit');
    await expect(page.getByLabel('Days', { exact: true })).toHaveValue(
      named('3', 'days', '·', '7', 'left after'),
    );
    await page.getByRole('button', { name: 'Send leave request' }).click();

    await expect(page).toHaveURL(/\/workers\/leave\/HR-LAP-/);
    const id = page.url().split('/').at(-1)!;
    await expectHeading(page, worker.name);
    await expect(page.getByText(named('Reason:', 'Family visit'))).toBeVisible();
    const totals = page.locator('app-totals-card');
    await expect(totals).toContainText(named('Left after approval'));
    await expect(totals).toContainText(named('7', 'days'));
    await expect(page.locator('app-feedback-card').first()).toContainText('Waiting for approval');
    expect(await leaveOf(page, id)).toMatchObject({
      status: 'Open',
      docstatus: 0,
      total_leave_days: 3,
    });

    await page.getByRole('button', { name: 'Approve leave' }).click();
    await expect(page.locator('app-feedback-card').first()).toContainText('Approved');
    await expect(page.getByRole('button', { name: 'Approve leave' })).toHaveCount(0);
    expect(await leaveOf(page, id)).toMatchObject({ status: 'Approved', docstatus: 1 });
  });

  test('rejects a waiting request from the list, and refuses more leave than is left', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    const worker = await workerWithLeave(page);
    await page.goto('/workers');
    await page.getByRole('button', { name: 'Leave requests' }).click();
    await expect(page).toHaveURL(/\/workers\/leave$/);
    await expectHeading(page, 'Leave requests');
    await page.getByRole('button', { name: 'Request leave' }).click();
    await page.getByLabel('Worker *').selectOption(worker.id);
    await expect(page.getByLabel('Leave type *')).toHaveValue('Privilege Leave');
    await page.getByLabel('From *').fill('2026-12-01');
    await page.getByLabel('To *').fill('2026-12-20');
    await page.getByRole('button', { name: 'Send leave request' }).click();
    await expect(page.getByText('Not enough leave left')).toBeVisible();

    await page.getByLabel('To *').fill('2026-12-02');
    await page.getByRole('button', { name: 'Send leave request' }).click();
    await expect(page).toHaveURL(/\/workers\/leave\/HR-LAP-/);
    const id = page.url().split('/').at(-1)!;
    await page.getByRole('button', { name: 'Back' }).click();
    await page.locator('app-search-field input').fill(worker.name);
    const card = page.locator('app-person-card', { hasText: worker.name });
    await expect(card).toContainText(named('2', 'days · Waiting for approval'));
    await card.click();
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.locator('app-feedback-card').first()).toContainText('Rejected');
    expect(await leaveOf(page, id)).toMatchObject({ status: 'Rejected', docstatus: 1 });
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('radio', { name: 'Decided' })).toBeChecked();
    await page.locator('app-search-field input').fill(worker.name);
    await expect(page.locator('app-person-card', { hasText: worker.name })).toContainText(
      'Rejected',
    );
  });

  test('shows leave requests and the form in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/workers/leave');
    await toArabic(page);
    await expectHeading(page, 'طلبات الإجازة');
    await expect(page.getByRole('radio', { name: 'بانتظار الاعتماد' })).toBeChecked();
    await page.getByRole('button', { name: 'طلب إجازة' }).click();
    await expectHeading(page, 'طلب إجازة');
    await page.getByRole('button', { name: 'إرسال طلب الإجازة' }).click();
    await expect(page.getByText('اختر العامل.')).toBeVisible();
  });
});

test('opens leave requests from the workers workspace @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/workers');
  await page.getByRole('button', { name: 'Leave requests' }).click();
  await expectHeading(page, 'Leave requests');
  await expect(page.getByRole('radio', { name: 'Waiting' })).toBeChecked();
});
