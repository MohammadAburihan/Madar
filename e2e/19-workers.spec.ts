import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, plain, runId, signIn, toArabic } from './support';

interface Employee {
  name: string;
  employee_name: string;
  first_name: string;
  last_name: string | null;
  gender: string;
  date_of_birth: string;
  date_of_joining: string;
  designation: string | null;
  department: string | null;
  cell_number: string | null;
  company: string;
  status: string;
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hebron' });

/** "20 Oct 2026", as Madar writes dates in English. */
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${new Date(y, m - 1, d).toLocaleString('en-GB', { month: 'short' })} ${y}`;
};

async function employee(page: Page, name: string): Promise<Employee> {
  const [row] = await erp(page).list<Employee>(
    'Employee',
    [
      'name',
      'employee_name',
      'first_name',
      'last_name',
      'gender',
      'date_of_birth',
      'date_of_joining',
      'designation',
      'department',
      'cell_number',
      'company',
      'status',
    ],
    [['employee_name', '=', name]],
  );
  expect(row, `Employee ${name}`).toBeTruthy();
  return row;
}

/** What ERPNext says the worker is doing today, in the list card's words. */
async function todayText(page: Page, id: string): Promise<string> {
  const [leave] = await erp(page).list<{ to_date: string }>(
    'Leave Application',
    ['to_date'],
    [
      ['employee', '=', id],
      ['from_date', '<=', today()],
      ['to_date', '>=', today()],
      ['status', '=', 'Approved'],
      ['docstatus', '=', 1],
    ],
  );
  if (leave) {
    return `On leave until ${shortDate(leave.to_date)}`;
  }
  const [attendance] = await erp(page).list<{ status: string }>(
    'Attendance',
    ['status'],
    [
      ['employee', '=', id],
      ['attendance_date', '=', today()],
      ['docstatus', '=', 1],
    ],
  );
  return attendance ? `${attendance.status} today` : 'Not marked today';
}

async function leaveLeft(page: Page, id: string): Promise<number> {
  const response = await page.request.get(
    `/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details?employee=${id}&date=${today()}`,
  );
  expect(response.ok()).toBe(true);
  const { message } = (await response.json()) as {
    message: { leave_allocation: Record<string, { remaining_leaves: number }> };
  };
  return Object.values(message.leave_allocation).reduce((s, a) => s + a.remaining_leaves, 0);
}

const days = (n: number) => [`${n}`, n === 1 ? 'day' : 'days'];

test.describe('workers @phone', () => {
  test('lists the workers as ERPNext has them today and opens one', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/more');
    await page.getByRole('button', { name: 'Workers', exact: true }).click();
    await expect(page).toHaveURL(/\/workers$/);
    await expectHeading(page, 'Workers');
    await expect(page.getByText(named('Workers & HR ·', 'Rehan Nursery'))).toBeVisible();

    const khaled = await employee(page, 'Khaled Omar');
    const rana = await employee(page, 'Rana Saleh');
    const khaledCard = page.locator('app-person-card', { hasText: 'Khaled Omar' });
    await expect(khaledCard).toContainText('Gardener · Field team');
    await expect(khaledCard).toContainText(
      named(...(await todayText(page, khaled.name)).split(' ')),
    );
    await expect(page.locator('app-person-card', { hasText: 'Rana Saleh' })).toContainText(
      named(...(await todayText(page, rana.name)).split(' ')),
    );
    // Those who left are on their own tab.
    await expect(page.locator('app-person-card', { hasText: 'Huda Nasser' })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Left' }).click();
    await expect(page.locator('app-person-card', { hasText: 'Huda Nasser' })).toContainText('Left');
    await page.locator('app-person-card', { hasText: 'Huda Nasser' }).click();
    await expect(page.getByText(named('Left on', '30 Jun 2026'))).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('radio', { name: 'Left' })).toBeChecked();

    await page.getByRole('radio', { name: 'Active' }).click();
    await page.locator('app-search-field input').fill('Garden');
    await expect(page.locator('app-person-card')).toHaveCount(1);
    await page.locator('app-person-card', { hasText: 'Khaled Omar' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${khaled.name}$`));
    await expectHeading(page, 'Khaled Omar');
    await expect(page.locator('app-page-heading')).toContainText(
      named('Gardener', '·', khaled.name),
    );
    await expect(page.getByText('059-000-0177')).toBeVisible();
    await expect(
      page.getByText(named('Field team', '·', 'Joined', shortDate(khaled.date_of_joining))),
    ).toBeVisible();
    const totals = page.locator('app-totals-card');
    await expect(totals).toContainText('Leave left');
    await expect(totals).toContainText(named(...days(await leaveLeft(page, khaled.name))));
    await expect(totals).toContainText('Present this month');
  });

  test('adds a worker, refusing what ERPNext would, then edits them', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/workers');
    await page.getByRole('button', { name: 'Add worker' }).click();
    await expect(page).toHaveURL(/\/workers\/new$/);
    await expectHeading(page, 'Add worker');
    await expect(page.getByLabel('Joining date *')).toHaveValue(today());
    await page.getByRole('button', { name: 'Save worker' }).click();
    await expect(page.getByText("Enter the worker's name.")).toBeVisible();
    await expect(page.getByText('Choose a gender.')).toBeVisible();

    const name = `Sami Worker ${runId()}`;
    await page.getByLabel('Name *').fill(name);
    await page.getByLabel('Gender *').selectOption('Male');
    await page.getByLabel('Date of birth *').fill(today());
    await page.getByRole('button', { name: 'Save worker' }).click();
    await expect(
      page.getByText('Enter a date of birth before today and before joining.'),
    ).toBeVisible();
    await page.getByLabel('Date of birth *').fill('1995-02-11');
    await page.getByLabel('Job title').selectOption('Gardener');
    await page.getByLabel('Department').selectOption({ label: 'Field team' });
    await page.getByLabel('Phone').fill('059-000-0199');
    await page.getByRole('button', { name: 'Save worker' }).click();

    await expect(page).toHaveURL(/\/workers\/HR-EMP-\d+$/);
    await expectHeading(page, name);
    const added = await employee(page, name);
    expect(added).toMatchObject({
      first_name: 'Sami',
      gender: 'Male',
      date_of_birth: '1995-02-11',
      date_of_joining: today(),
      designation: 'Gardener',
      department: 'Field team - RN',
      cell_number: '059-000-0199',
      company: 'Rehan Nursery',
      status: 'Active',
    });
    await expect(page.locator('app-page-heading')).toContainText(
      named('Gardener', '·', added.name),
    );

    await page.getByRole('button', { name: 'Edit worker' }).click();
    await expectHeading(page, 'Edit worker');
    await expect(page.getByLabel('Name *')).toHaveValue(name);
    await expect(page.getByLabel('Department')).toHaveValue('Field team - RN');
    await page.getByLabel('Phone').fill('059-000-0200');
    await page.getByLabel('Job title').selectOption('Driver');
    await page.getByRole('button', { name: 'Save worker' }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${added.name}$`));
    await expect(page.getByText('059-000-0200')).toBeVisible();
    await expect(page.locator('app-page-heading')).toContainText(named('Driver', '·', added.name));
    expect(await employee(page, name)).toMatchObject({
      cell_number: '059-000-0200',
      designation: 'Driver',
      date_of_birth: '1995-02-11',
    });
  });

  test('keeps Workers to the HR roles, even by link', async ({ page }) => {
    await signIn(page, 'salesperson');
    await page.goto('/more');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('More');
    await expect(page.getByRole('button', { name: 'Workers', exact: true })).toHaveCount(0);
    await page.goto('/workers');
    await expect(page.getByText("Workers aren't open to your role")).toBeVisible();
    await page.goto('/workers/new');
    await expect(page.getByText("You can't add or edit workers")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save worker' })).toHaveCount(0);
  });

  test('shows the workers and the form in Arabic, right to left', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/workers');
    await toArabic(page);
    await expectHeading(page, 'العمال');
    await expect(page.getByRole('radio', { name: 'على رأس العمل' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'غادروا' })).toBeVisible();
    const khaled = page.locator('app-person-card', { hasText: 'Khaled Omar' });
    await expect(khaled).toContainText(/حاضر اليوم|لم يُسجَّل اليوم|في إجازة/);
    await page.getByRole('button', { name: 'إضافة عامل' }).click();
    await expectHeading(page, 'إضافة عامل');
    await expect(page.getByLabel('الجنس *').locator('option', { hasText: 'ذكر' })).toBeAttached();
    await expect(page.getByLabel('تاريخ الميلاد *')).toBeVisible();
    await page.getByRole('button', { name: 'حفظ العامل' }).click();
    await expect(page.getByText('أدخل اسم العامل.')).toBeVisible();
  });
});

test('works through the workers table and panel @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.getByRole('link', { name: 'Workers' }).click();
  await expect(page).toHaveURL(/\/workers$/);
  await expectHeading(page, 'Workers');
  const table = page.locator('app-data-table');
  await expect(table.locator('th')).toHaveText(['Worker', 'Job title', 'Today']);
  const rana = await employee(page, 'Rana Saleh');
  const row = table.locator('tbody tr').filter({ hasText: 'Rana Saleh' });
  await expect(row).toContainText('Cashier');
  const status = await todayText(page, rana.name);
  await expect(row).toContainText(
    status.startsWith('On leave') ? 'On leave' : status.replace(' today', ''),
  );
  await row.click();
  const panel = page.locator('section.panel');
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Rana Saleh');
  await expect(panel).toContainText(named('Cashier', '·', rana.name));
  await expect(panel.locator('app-feedback-card')).toContainText(
    named(...days(await leaveLeft(page, rana.name)), 'leave left'),
  );
  await page.getByRole('button', { name: 'Open worker' }).click();
  await expect(page).toHaveURL(new RegExp(`/workers/${rana.name}$`));
  await expectHeading(page, 'Rana Saleh');

  await page.goto('/workers');
  await page.getByRole('button', { name: '+ Add worker' }).click();
  await expect(page).toHaveURL(/\/workers\/new$/);
  await expect(plain(await page.locator('h1').first().innerText())).toBe('Add worker');
});
