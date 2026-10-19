import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

/** A fresh customer or supplier, made through ERPNext as the signed-in owner, so runs never share one. */
async function party(page: Page, doctype: 'Customer' | 'Supplier', name: string): Promise<string> {
  const doc =
    doctype === 'Customer'
      ? { doctype, customer_name: name, customer_type: 'Individual' }
      : { doctype, supplier_name: name, supplier_type: 'Company' };
  const response = await page.request.post('/api/method/frappe.client.insert', { data: { doc } });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { message: { name: string } }).message.name;
}

test.describe('deactivating contacts @phone', () => {
  test('deactivates a customer, finds them under Inactive, and reactivates them', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    const name = `E2E Inactive ${runId()}`;
    const id = await party(page, 'Customer', name);
    await page.goto(`/contacts/customers/${encodeURIComponent(id)}`);
    await expectHeading(page, name);
    await page.getByRole('button', { name: 'Deactivate customer' }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toContainText(named('Deactivate', name, '?'));
    await expect(dialog).not.toContainText('still owe');
    await dialog.getByRole('button', { name: 'Deactivate', exact: true }).click();
    await expect(page.locator('app-status-chip')).toContainText('Inactive');
    await expect(page.locator('app-feedback-card').first()).toContainText('Deactivated');
    await expect(page.getByRole('button', { name: /^Sell to/ })).toHaveCount(0);
    const [doc] = await erp(page).list<{ disabled: number }>(
      'Customer',
      ['disabled'],
      [['name', '=', id]],
    );
    expect(doc.disabled).toBe(1);

    await page.goto('/contacts');
    await page.locator('app-search-field input').fill(name);
    await expect(page.locator('app-person-card').filter({ hasText: name })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Inactive' }).click();
    await page.locator('app-person-card').filter({ hasText: name }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    // Back returns to the Inactive list it came from.
    await expect(page.locator('app-person-card').filter({ hasText: name })).toBeVisible();
    await page.locator('app-person-card').filter({ hasText: name }).click();
    await page.getByRole('button', { name: 'Reactivate customer' }).click();
    await page
      .locator('dialog[open]')
      .getByRole('button', { name: 'Reactivate', exact: true })
      .click();
    await expect(page.locator('app-feedback-card').first()).toContainText('Reactivated');
    await expect(page.locator('app-status-chip')).toHaveCount(0);
  });

  test('warns what a customer still owes before deactivating', async ({ page }) => {
    await signIn(page, 'owner');
    const [unpaid] = await erp(page).list<{ customer: string }>(
      'Sales Invoice',
      ['customer'],
      [
        ['docstatus', '=', 1],
        ['outstanding_amount', '>', 0],
        ['customer', '!=', 'Walk-in Customer'],
      ],
      { limit_page_length: 1 },
    );
    await page.goto(`/contacts/customers/${encodeURIComponent(unpaid.customer)}`);
    await page.getByRole('button', { name: 'Deactivate customer' }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toContainText(named('They still owe', 'ILS'));
    await dialog.getByRole('button', { name: 'Keep active' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('app-status-chip')).toHaveCount(0);
  });

  test('asks in Arabic', async ({ page }) => {
    await signIn(page, 'owner');
    const id = await party(page, 'Customer', `E2E AR ${runId()}`);
    await page.goto(`/contacts/customers/${encodeURIComponent(id)}`);
    await toArabic(page);
    await page.getByRole('button', { name: 'إيقاف تنشيط العميل' }).click();
    await expect(page.locator('dialog[open]')).toContainText('يخرج من قوائم جهات الاتصال');
    await page.locator('dialog[open]').getByRole('button', { name: 'إبقاء نشطاً' }).click();
  });

  test("doesn't offer it to roles that can't edit the contact", async ({ page }) => {
    await signIn(page, 'warehouse');
    await page.goto('/contacts/suppliers/Green%20Clay');
    await expectHeading(page, 'Green Clay');
    await expect(page.getByRole('button', { name: 'Deactivate supplier' })).toHaveCount(0);
  });
});

test('deactivates a supplier from the contacts panel @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  const name = `E2E Supplier ${runId()}`;
  await party(page, 'Supplier', name);
  await page.goto('/contacts?kind=suppliers');
  await page.locator('app-search-field input').fill(name);
  await page.locator('app-data-table tbody tr').filter({ hasText: name }).click();
  const panel = page.locator('section.panel');
  await panel.getByRole('button', { name: 'Deactivate supplier' }).click();
  await page
    .locator('dialog[open]')
    .getByRole('button', { name: 'Deactivate', exact: true })
    .click();
  await expect(page.locator('app-data-table tbody tr').filter({ hasText: name })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Inactive' }).click();
  await expect(page.locator('app-data-table tbody tr').filter({ hasText: name })).toHaveCount(1);
});
