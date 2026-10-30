import { Page, expect, test } from '@playwright/test';
import { CUSTOMER, SUPPLIER, erp, expectHeading, ils, named, plain, signIn } from './support';

type Row = Record<string, unknown>;
const owed = (r: Row) => Number(r['base_rounded_total']) || Number(r['base_grand_total']) || 0;
const round = (n: number) => Math.round(n * 100) / 100;

/** The site's "today": the posting date of its newest submitted sale (earlier specs sold today). */
async function siteToday(page: Page): Promise<string> {
  const [latest] = await erp(page).list<Row>(
    'Sales Invoice',
    ['posting_date'],
    [['docstatus', '=', 1]],
    { order_by: 'creation desc', limit_page_length: 1 },
  );
  return String(latest['posting_date']);
}

/** The desktop table's rows as cell texts, by column header. */
async function tableRows(page: Page): Promise<Record<string, string>[]> {
  const table = page.locator('app-data-table').first();
  await expect(table.locator('tbody tr').first()).toBeVisible();
  const headers = (await table.locator('thead th').allInnerTexts()).map(plain);
  const rows = await table.locator('tbody tr').all();
  return Promise.all(
    rows.map(async (row) => {
      const cells = (await row.locator('td').allInnerTexts()).map(plain);
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    }),
  );
}

test.describe('the figures on screen are ERPNext’s @desktop', () => {
  test('Home: today’s confirmed sales and what customers owe', async ({ page }) => {
    await signIn(page, 'owner');
    const today = await siteToday(page);
    const sales = await erp(page).list<Row>(
      'Sales Invoice',
      ['base_grand_total'],
      [
        ['docstatus', '=', 1],
        ['is_return', '=', 0],
        // A balance recorded from before Madar is owed, not sold today.
        ['is_opening', '!=', 'Yes'],
        ['posting_date', '=', today],
      ],
    );
    const unpaid = await erp(page).list<Row>(
      'Sales Invoice',
      ['outstanding_amount'],
      [
        ['docstatus', '=', 1],
        ['outstanding_amount', '>', 0],
      ],
    );
    await page.goto('/');
    await expect(page.getByText('Today at a glance')).toBeVisible();
    await expect(
      page.getByText(ils(round(sales.reduce((s, r) => s + Number(r['base_grand_total']), 0)))),
    ).toBeVisible();
    await expect(
      page.getByText(ils(round(unpaid.reduce((s, r) => s + Number(r['outstanding_amount']), 0)))),
    ).toBeVisible();
  });

  test('Inventory: every quantity is the warehouse’s stock', async ({ page }) => {
    await signIn(page, 'owner');
    const warehouses = await erp(page).list<Row>(
      'Warehouse',
      ['name', 'warehouse_name'],
      [['is_group', '=', 0]],
    );
    const idOf = new Map(warehouses.map((w) => [String(w['warehouse_name']), String(w['name'])]));
    const bins = await erp(page).list<Row>('Bin', ['item_code', 'warehouse', 'actual_qty']);
    const stock = (item: string, warehouse: string) =>
      Number(
        bins.find((b) => b['item_code'] === item && b['warehouse'] === idOf.get(warehouse))?.[
          'actual_qty'
        ] ?? 0,
      );
    await page.goto('/inventory');
    const rows = await tableRows(page);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const code = row['Item'].split(' · ').pop()!;
      for (const [column, value] of Object.entries(row)) {
        if (idOf.has(column)) {
          expect(`${code} in ${column}: ${value}`).toBe(
            `${code} in ${column}: ${stock(code, column)} ${value.split(' ').pop()}`,
          );
        }
      }
    }
  });

  test('Money: each payment’s amount is the payment entry’s', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/money');
    const rows = (await tableRows(page)).filter((r) => r['Record'].includes('PAY')).slice(0, 8);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const name = row['Record'].split(' · ')[0];
      const entry = await erp(page).doc<Row>('Payment Entry', name);
      expect(`${name}: ${row['Amount']}`).toBe(
        `${name}: ${ils(Number(entry['base_paid_amount']))}`,
      );
    }
  });

  test('Sales: each invoice shows what is still owed, or its total when settled', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto('/sales');
    const rows = (await tableRows(page)).slice(0, 10);
    for (const row of rows) {
      const name = row['Document'];
      const invoice = await erp(page).doc<Row>('Sales Invoice', name);
      const outstanding = Number(invoice['outstanding_amount']);
      const expected =
        Number(invoice['docstatus']) === 1 && outstanding > 0.005
          ? `${ils(outstanding)} due`
          : // A credit note reads as the negative amount it is.
            ils(owed(invoice));
      expect(`${name}: ${row['Amount']}`).toBe(`${name}: ${expected}`);
    }
  });

  test('Contacts: a customer’s and a supplier’s balance', async ({ page }) => {
    await signIn(page, 'owner');
    const customerInvoices = await erp(page).list<Row>(
      'Sales Invoice',
      ['outstanding_amount'],
      [
        ['customer', '=', CUSTOMER],
        ['docstatus', '=', 1],
      ],
    );
    const supplierInvoices = await erp(page).list<Row>(
      'Purchase Invoice',
      ['outstanding_amount'],
      [
        ['supplier', '=', SUPPLIER],
        ['docstatus', '=', 1],
      ],
    );
    const sum = (rows: Row[]) =>
      round(rows.reduce((s, r) => s + Number(r['outstanding_amount']), 0));
    await page.goto('/contacts');
    await page.locator('app-search-field input').fill(CUSTOMER);
    const customer = page.locator('app-data-table tbody tr').filter({ hasText: CUSTOMER }).first();
    await expect(customer).toContainText(ils(sum(customerInvoices)));
    await page.getByRole('radio', { name: 'Suppliers' }).click();
    await page.locator('app-search-field input').fill(SUPPLIER);
    const supplier = page.locator('app-data-table tbody tr').filter({ hasText: SUPPLIER }).first();
    await expect(supplier).toContainText(ils(sum(supplierInvoices)));
  });

  test('Invoice page: total, paid and outstanding', async ({ page }) => {
    await signIn(page, 'owner');
    // A sale that was later returned: the credit note mustn't read as money paid.
    const [returned] = await erp(page).list<Row>(
      'Sales Invoice',
      ['return_against'],
      [
        ['is_return', '=', 1],
        ['docstatus', '=', 1],
        ['update_outstanding_for_self', '=', 0],
      ],
      { order_by: 'creation desc', limit_page_length: 1 },
    );
    test.skip(
      !returned,
      'needs a sale returned against what was owed (11-sales-returns makes one)',
    );
    const name = String(returned['return_against']);
    const invoice = await erp(page).doc<Row>('Sales Invoice', name);
    const payments = await erp(page).list<Row>(
      'Payment Entry Reference',
      ['allocated_amount', 'parent'],
      [
        ['reference_name', '=', name],
        ['docstatus', '=', 1],
      ],
      { parent: 'Payment Entry' },
    );
    const paid = round(payments.reduce((s, r) => s + Number(r['allocated_amount']), 0));
    await page.goto(`/sales/invoices/${name}`);
    await expectHeading(page, named('Sales invoice', name));
    const totals = page.locator('app-totals-card');
    await expect(totals).toContainText(ils(owed(invoice)));
    await expect(totals.locator('div', { hasText: 'Amount paid' }).last()).toContainText(ils(paid));
    await expect(totals.locator('div', { hasText: 'Outstanding' }).last()).toContainText(
      ils(Number(invoice['outstanding_amount'])),
    );
  });

  test('Quotation and sales order pages: totals and delivered quantities', async ({ page }) => {
    await signIn(page, 'owner');
    const [quotation] = await erp(page).list<Row>(
      'Quotation',
      ['name', 'base_grand_total', 'base_rounded_total', 'status'],
      [['docstatus', '=', 1]],
      { order_by: 'creation desc', limit_page_length: 1 },
    );
    await page.goto(`/sales/quotes/${quotation['name']}`);
    await expect(page.locator('app-feedback-card').first()).toContainText(ils(owed(quotation)));

    const [order] = await erp(page).list<Row>('Sales Order', ['name'], [['docstatus', '=', 1]], {
      order_by: 'creation desc',
      limit_page_length: 1,
    });
    const doc = await erp(page).doc<{ items: Row[] }>('Sales Order', String(order['name']));
    const goods = new Set(
      (
        await erp(page).list<Row>(
          'Item',
          ['name'],
          [
            ['name', 'in', doc.items.map((i) => i['item_code'])],
            ['is_stock_item', '=', 1],
          ],
        )
      ).map((i) => String(i['name'])),
    );
    await page.goto(`/sales/orders/${order['name']}`);
    for (const item of doc.items.filter((i) => goods.has(String(i['item_code'])))) {
      await expect(
        page.locator('app-item-card', { hasText: String(item['item_name']) }).first(),
      ).toContainText(
        named(
          String(Number(item['qty'])),
          'ordered ·',
          String(Number(item['delivered_qty'])),
          'delivered',
        ),
      );
    }
  });
});

test('the phone cards carry the same figures @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales');
  const card = page.locator('button.card app-feedback-card').first();
  await expect(card).toBeVisible();
  const text = plain(await card.innerText());
  const name = text.split(' · ')[0];
  const invoice = await erp(page).doc<Row>('Sales Invoice', name);
  const outstanding = Number(invoice['outstanding_amount']);
  expect(text).toContain(outstanding > 0.005 ? `${ils(outstanding)} due` : ils(owed(invoice)));

  const invoices = await erp(page).list<Row>(
    'Sales Invoice',
    ['outstanding_amount'],
    [
      ['customer', '=', CUSTOMER],
      ['docstatus', '=', 1],
    ],
  );
  const owes = round(invoices.reduce((s, r) => s + Number(r['outstanding_amount']), 0));
  await page.goto('/contacts');
  await page.locator('app-search-field input').fill(CUSTOMER);
  await expect(page.locator('app-person-card', { hasText: CUSTOMER }).first()).toContainText(
    named('Outstanding', ils(owes)),
  );
});
