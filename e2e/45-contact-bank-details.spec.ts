import { Page, expect, test } from '@playwright/test';
import { erp, expectHeading, named, runId, signIn, toArabic } from './support';

const IBAN = 'JO94CBJO0010000000000131000302';
const IBAN_2 = 'GB82WEST12345698765432';

interface Account {
  name: string;
  bank: string;
  iban: string | null;
  bank_account_no: string | null;
  disabled: number;
  party_type: string;
}

const accounts = (page: Page, doctype: 'Customer' | 'Supplier', id: string) =>
  erp(page).list<Account>(
    'Bank Account',
    ['name', 'bank', 'iban', 'bank_account_no', 'disabled', 'party_type'],
    [
      ['party_type', '=', doctype],
      ['party', '=', id],
    ],
  );

const partyId = (page: Page) => decodeURIComponent(page.url().split('/').pop()!);

/** Types a new bank name and chooses "Add bank". */
async function addBank(page: Page, bank: string, [open, close] = ['Add bank “', '”']) {
  const input = page.locator('#bank-input');
  await input.fill(bank);
  await page.getByRole('option', { name: named(open, bank, close) }).click();
  await expect(input).toHaveValue(bank);
}

test.describe.serial('bank details on a customer @phone', () => {
  const name = `E2E Bank Customer ${runId()}`;
  const bank = `E2E Bank ${runId()}`;
  let detail = '';

  test('adds a customer with a new bank, IBAN and account number', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/contacts/new?type=customers');
    await expect(page.getByRole('heading', { name: 'Bank details (optional)' })).toBeVisible();
    await page.getByLabel('Name *').fill(name);
    await addBank(page, bank);
    await page.getByLabel(/^IBAN/).fill(IBAN.replace(/(.{4})/g, '$1 ').toLowerCase());
    await page.getByLabel('Account number').fill('123-456');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/, { timeout: 30_000 });
    detail = page.url();
    await expectHeading(page, name);

    const rows = await accounts(page, 'Customer', partyId(page));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bank,
      iban: IBAN,
      bank_account_no: '123-456',
      disabled: 0,
    });
    const card = page.locator('app-bank-details-card');
    await expect(card).toContainText('Bank details');
    await expect(card).toContainText(bank);
    await expect(card).toContainText(IBAN);
    await expect(card).toContainText('123-456');
  });

  test('editing the IBAN updates the same account', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(detail);
    await page.getByRole('button', { name: 'Edit contact' }).click();
    await expect(page.locator('#bank-input')).toHaveValue(bank);
    await expect(page.getByLabel(/^IBAN/)).toHaveValue(IBAN);
    await page.getByLabel(/^IBAN/).fill(IBAN_2);
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(detail, { timeout: 30_000 });
    await expect(page.locator('app-bank-details-card')).toContainText(IBAN_2);
    const rows = await accounts(page, 'Customer', partyId(page));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ iban: IBAN_2, bank_account_no: '123-456', disabled: 0 });
  });

  test('clearing the bank details disables the account, and adding them again re-enables it', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(detail);
    await page.getByRole('button', { name: 'Edit contact' }).click();
    await page.locator('#bank-input').fill('');
    await page.getByLabel(/^IBAN/).fill('');
    await page.getByLabel('Account number').fill('');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(detail, { timeout: 30_000 });
    await expect(page.locator('app-bank-details-card')).toHaveCount(0);
    let rows = await accounts(page, 'Customer', partyId(page));
    expect(rows).toHaveLength(1);
    expect(rows[0].disabled).toBe(1);

    await page.getByRole('button', { name: 'Edit contact' }).click();
    await expect(page.locator('#bank-input')).toHaveValue('');
    await page.locator('#bank-input').fill(bank);
    await page.getByLabel('Account number').fill('777');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page).toHaveURL(detail, { timeout: 30_000 });
    await expect(page.locator('app-bank-details-card')).toContainText('777');
    rows = await accounts(page, 'Customer', partyId(page));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ disabled: 0, bank_account_no: '777' });
  });

  test('refuses an invalid IBAN and a number without a bank', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/contacts/new?type=customers');
    await page.getByLabel('Name *').fill(`E2E Bank Invalid ${runId()}`);
    await page.getByLabel(/^IBAN/).fill('JO95CBJO0010000000000131000302');
    await expect(page.getByText(/Enter a valid IBAN/)).toHaveCount(0);
    await page.getByLabel(/^IBAN/).blur();
    await expect(page.getByText(/Enter a valid IBAN/)).toBeVisible();
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByText('Choose the bank these numbers belong to.')).toBeVisible();
    await expect(page).toHaveURL(/\/contacts\/new/);
    await page.getByLabel(/^IBAN/).fill('');
    await page.getByLabel('Account number').fill('12/34');
    await expect(page.getByText('Use letters, digits and dashes only.')).toBeVisible();
  });

  test('offers the existing banks while typing, never a near match as the bank', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto('/contacts/new?type=customers');
    await page.locator('#bank-input').fill(bank.slice(0, -2));
    await expect(page.getByRole('option', { name: bank, exact: true })).toBeVisible();
    await page.getByLabel('Name *').fill(`E2E Bank Near ${runId()}`);
    await page.getByLabel('Account number').fill('1');
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByText(/Choose a bank from the list/)).toBeVisible();
    await expect(page).toHaveURL(/\/contacts\/new/);
  });
});

test('picks a new bank with the keyboard and saves it @phone', async ({ page }) => {
  const name = `E2E Bank Keys ${runId()}`;
  const bank = `E2E Keys ${runId()}`;
  await signIn(page, 'owner');
  await page.goto('/contacts/new?type=customers');
  await page.getByLabel('Name *').fill(name);
  const input = page.locator('#bank-input');
  await input.fill(bank);
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.press('ArrowDown');
  const add = page.getByRole('option', { name: named('Add bank “', bank, '”') });
  await expect(add).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', (await add.getAttribute('id'))!);
  await input.press('Enter');
  await expect(add).toHaveCount(0);
  await expect(input).toHaveValue(bank);
  await page.getByLabel(/^IBAN/).fill(IBAN);
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/, { timeout: 30_000 });
  await expect(page.locator('app-bank-details-card')).toContainText(bank);
  const group = page.locator('app-bank-details-card .group');
  await expect(group.first()).toHaveText('JO94');
  const rows = await accounts(page, 'Customer', partyId(page));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ bank, iban: IBAN });
});

test('a failed bank step does not leak into the next Add customer @phone', async ({ page }) => {
  const first = `E2E Bank Revisit ${runId()}`;
  const second = `E2E Bank Fresh ${runId()}`;
  const bank = `E2E Revisit ${runId()}`;
  let block = true;
  await page.route('**/api/method/frappe.client.insert', async (route) => {
    if (block && (route.request().postData() ?? '').includes('Bank Account')) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else {
      await route.fallback();
    }
  });
  await signIn(page, 'owner');
  await page.goto('/contacts');
  await page.getByRole('button', { name: 'Add customer or supplier' }).click();
  await page.getByLabel('Name *').fill(first);
  await addBank(page, bank);
  await page.getByLabel(/^IBAN/).fill(IBAN);
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByText('Contact saved, bank details not saved')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/contacts(\?|$)/);
  block = false;
  await page.getByRole('button', { name: 'Add customer or supplier' }).click();
  await expect(page).toHaveURL(/\/contacts\/new/);
  await expect(page.getByLabel('Name *')).toHaveValue('');
  await expect(page.getByText('Contact saved, bank details not saved')).toHaveCount(0);
  await expect(page.locator('#bank-input')).toHaveValue('');
  await page.getByLabel('Name *').fill(second);
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page).toHaveURL(/\/contacts\/customers\/[^/]+$/, { timeout: 30_000 });
  await expectHeading(page, second);
  const found = await erp(page).list<{ name: string; customer_name: string }>(
    'Customer',
    ['name', 'customer_name'],
    [['customer_name', 'in', [first, second]]],
  );
  expect(found.map((c) => c.customer_name).sort()).toEqual([first, second].sort());
});

test('a salesperson adding a customer sees no bank section @phone', async ({ page }) => {
  await signIn(page, 'salesperson');
  await page.goto('/contacts/new');
  await expectHeading(page, 'Add contact');
  await expect(page.getByLabel('Name *')).toBeVisible();
  await expect(page.getByText('Bank details')).toHaveCount(0);
  await expect(page.getByLabel(/^IBAN/)).toHaveCount(0);
});

test('adds a supplier with bank details in Arabic @phone', async ({ page }) => {
  const name = `E2E Bank Supplier ${runId()}`;
  const bank = `E2E Arab ${runId()}`;
  await signIn(page, 'owner');
  await page.goto('/contacts/new?type=suppliers');
  await toArabic(page);
  await expect(page.getByRole('heading', { name: 'بيانات البنك (اختياري)' })).toBeVisible();
  await page.getByLabel('الاسم *').fill(name);
  await addBank(page, bank, ['إضافة البنك «', '»']);
  await page
    .getByLabel('رقم الآيبان (IBAN)')
    .fill('جو٩٤CBJO0010000000000131000302'.replace('جو', 'JO'));
  await page.getByLabel('رقم الحساب').fill('٩٨٧-٦٥');
  await page.getByRole('button', { name: 'حفظ جهة الاتصال' }).click();
  await expect(page).toHaveURL(/\/contacts\/suppliers\/[^/]+$/, { timeout: 30_000 });
  const card = page.locator('app-bank-details-card');
  await expect(card).toContainText('بيانات البنك');
  await expect(card).toContainText(bank);
  await expect(card).toContainText(IBAN);
  await expect(card).toContainText('987-65');
  const rows = await accounts(page, 'Supplier', partyId(page));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ bank, iban: IBAN, bank_account_no: '987-65' });
});

test('adds a supplier with bank details from the desktop workspace @desktop', async ({ page }) => {
  const name = `E2E Bank Supplier ${runId()}`;
  const bank = `E2E Desk Bank ${runId()}`;
  await signIn(page, 'owner');
  await page.goto('/contacts?kind=suppliers');
  await page.getByRole('button', { name: '+ Add contact' }).click();
  await expect(page.getByLabel('Contact type')).toHaveValue('suppliers');
  await page.getByLabel('Name *').fill(name);
  await addBank(page, bank);
  await page.getByLabel(/^IBAN/).fill(IBAN);
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page).toHaveURL(/\/contacts\/suppliers\/[^/]+$/, { timeout: 30_000 });
  await expect(page.locator('app-bank-details-card')).toContainText(IBAN);
  const rows = await accounts(page, 'Supplier', partyId(page));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ bank, iban: IBAN, bank_account_no: null });
});
