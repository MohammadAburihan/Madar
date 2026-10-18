import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

/** A draft expense claim of this run, waiting in the seeded Madar workflow for an Expense Approver. */
async function newClaim(page: Page, description: string): Promise<string> {
  const [rana] = await erp(page).list<{ name: string }>(
    'Employee',
    ['name'],
    [['employee_name', '=', 'Rana Saleh']],
  );
  const response = await page.request.post('/api/method/frappe.client.insert', {
    data: {
      doc: {
        doctype: 'Expense Claim',
        employee: rana.name,
        company: 'Rehan Nursery',
        expense_approver: 'rehan@rehan.example',
        payable_account: 'Creditors - RN',
        expenses: [
          {
            expense_type: 'Travel',
            amount: 75,
            sanctioned_amount: 75,
            cost_center: 'Main - RN',
            description,
          },
        ],
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: { name: string } }).message.name;
}

const stateOf = async (page: Page, name: string) =>
  await erp(page).doc<{ workflow_state: string; docstatus: number }>('Expense Claim', name);

test.describe('approvals @phone', () => {
  test('approves an expense claim from the inbox', async ({ page }) => {
    await signIn(page, 'owner');
    const description = `Fuel ${runId()}`;
    const name = await newClaim(page, description);
    await page.goto('/more');
    await page.getByRole('button', { name: 'Approvals', exact: true }).click();
    await expectHeading(page, 'Approvals');
    await page.locator('app-search-field input').fill(name);
    const card = page.locator('app-person-card', { hasText: name });
    await expect(card).toContainText(named('Expense claim ·', 'Rana Saleh'));
    await expect(card).toContainText(named('ILS 75.00', '·', 'Draft'));
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/approvals/Expense%20Claim/${name}$`));
    await expect(page.getByText(description)).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.locator('app-feedback-card', { hasText: 'Done' })).toContainText(
      named('It now reads', 'Approved'),
    );
    expect(await stateOf(page, name)).toMatchObject({ workflow_state: 'Approved', docstatus: 1 });
  });

  test('rejects a claim, and the inbox no longer shows it', async ({ page }) => {
    await signIn(page, 'owner');
    const name = await newClaim(page, `Parking ${runId()}`);
    await page.goto(`/approvals/Expense%20Claim/${name}`);
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.locator('app-feedback-card', { hasText: 'Done' })).toContainText('Rejected');
    expect(await stateOf(page, name)).toMatchObject({ workflow_state: 'Rejected' });
    await page.getByRole('button', { name: 'Back to approvals' }).click();
    await page.locator('app-search-field input').fill(name);
    await expect(page.getByText('Nothing waiting matches your search.')).toBeVisible();
  });

  test('shows approvals in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/approvals');
    await toArabic(page);
    await expectHeading(page, 'الموافقات');
    await expect(page.getByRole('button', { name: 'العودة إلى الرئيسية' })).toBeVisible();
  });

  test('keeps approvals from roles without them', async ({ page }) => {
    await signIn(page, 'salesperson');
    await page.goto('/more');
    await expect(page.getByRole('button', { name: 'Approvals', exact: true })).toHaveCount(0);
    await page.goto('/approvals');
    await expect(page.getByText("Approvals aren't open to your role")).toBeVisible();
  });
});

test('opens approvals from the sidebar @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.getByRole('link', { name: 'Approvals' }).click();
  await expectHeading(page, 'Approvals');
});
