import { expect, test } from '@playwright/test';
import { ITEM, MAIN, choose, expectHeading, named, signIn, toArabic, topUp } from './support';

test('sells in Arabic, right to left, from start to receipt @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales/new');
  await toArabic(page);
  await expectHeading(page, 'عملية بيع جديدة');
  await page.getByRole('button', { name: 'عميل نقدي' }).click();
  await choose(page.locator('app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page
    .getByRole('button', { name: named('إضافة', ITEM.name) })
    .first()
    .click();
  await page.getByRole('button', { name: /^مراجعة السلة/ }).click();
  await page.getByRole('button', { name: 'المتابعة إلى الدفع' }).click();
  await page.getByRole('button', { name: /^تأكيد البيع/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  await expectHeading(page, 'تم تأكيد البيع');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('reads the reports in Arabic @desktop', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/reports');
  await toArabic(page);
  await expectHeading(page, 'التقارير');
  await expect(page.locator('app-metric-cards')).toContainText('الربح');
});

test('lists the sales in Arabic @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales');
  await toArabic(page);
  await expectHeading(page, 'المبيعات');
  await expect(page.getByRole('radio', { name: 'الفواتير' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('app-feedback-card').first()).toContainText('مؤكدة');
  await page.getByRole('radio', { name: 'الطلبات' }).click();
  await expect(page.locator('app-feedback-card').first()).toContainText('طلب');
});

test('quotes in Arabic, right to left @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await topUp(page, 'POT-30', MAIN, 5);
  await page.goto('/sales/quote/new');
  await toArabic(page);
  await expectHeading(page, 'عرض سعر جديد');
  await page.getByLabel('العميل').fill('Lina');
  await page.locator('app-person-card').first().click();
  await page.getByLabel('الأصناف').fill('POT-30');
  await page.locator('app-item-card').filter({ hasText: 'POT-30' }).first().click();
  await expect(page.getByText(/إجمالي عرض السعر/)).toBeVisible();
  await page.getByRole('button', { name: 'تأكيد عرض السعر' }).click();
  await expect(page).toHaveURL(/\/sales\/quotes\/[^/]+$/, { timeout: 60_000 });
  await expectHeading(page, 'تم تأكيد عرض السعر');

  // The same quotation ordered, delivered and invoiced, all in Arabic.
  await page.getByRole('button', { name: 'إنشاء أمر بيع' }).click();
  await expect(page).toHaveURL(/\/sales\/orders\/[^/]+$/, { timeout: 60_000 });
  await expectHeading(page, /أمر البيع/);
  await page.getByRole('button', { name: 'تجهيز التسليم' }).click();
  await expectHeading(page, 'تسليم الطلب');
  await expect(page.getByText('قبل التأكيد')).toBeVisible();
  await page.getByRole('button', { name: 'تأكيد التسليم' }).click();
  await expect(page).toHaveURL(/\/deliver\/done$/, { timeout: 60_000 });
  await expectHeading(page, 'تم تأكيد التسليم');
  await page.getByRole('button', { name: 'مراجعة فاتورة أمر البيع' }).click();
  await expectHeading(page, 'مراجعة فاتورة أمر البيع');
  await expect(page.locator('app-feedback-card').first()).toContainText('فاتورة فقط');
  await page.getByRole('button', { name: 'تأكيد الفاتورة' }).click();
  await expect(page).toHaveURL(/\/invoice\/done$/, { timeout: 60_000 });
  await expectHeading(page, 'تم تسجيل فاتورة أمر البيع');
  await expect(page.locator('app-feedback-card').first()).toContainText('غير مدفوع');
});

test('reads a sales order in Arabic, right to left @phone', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/sales');
  await toArabic(page);
  await page.getByRole('radio', { name: 'الطلبات' }).click();
  await page.locator('button.card').first().click();
  await expect(page).toHaveURL(/\/sales\/orders\/[^/]+$/);
  await expectHeading(page, /أمر البيع/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('app-status-chip').first()).toContainText(named('الطلب', ':'));
  await expect(page.getByLabel('التسليم المتوقع')).toBeVisible();
});

test('takes a return against a paid sale in Arabic, keeping the credit for the customer @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await topUp(page, ITEM.code, MAIN, 5);
  await page.goto('/sales/new');
  await page.getByRole('button', { name: 'Walk-in customer' }).click();
  await choose(page.locator('app-select-field select').first(), MAIN);
  await page.locator('app-search-field input').fill(ITEM.code);
  await page
    .getByRole('button', { name: named('Add', ITEM.name) })
    .first()
    .click();
  await page.getByRole('button', { name: /^Review basket/ }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: /^Confirm sale/ }).click();
  await expect(page).toHaveURL(/\/sales\/new\/receipt$/, { timeout: 60_000 });
  const subtitle = await page.locator('app-page-heading p').first().innerText();
  const invoice = subtitle.split(' · ')[0].replace(/[⁦-⁩]/g, '').trim();

  await page.goto(`/sales/invoices/${invoice}/return`);
  await toArabic(page);
  await expectHeading(page, 'إرجاع من عملية بيع');
  await expect(page.getByLabel('كمية الإرجاع')).toHaveValue('1');
  await expect(page.locator('app-feedback-card', { hasText: 'ملخص الإرجاع' })).toContainText(
    'يبقى رصيداً في حساب العميل',
  );
  await page.getByRole('button', { name: 'تأكيد الإرجاع' }).click();
  await expect(page).toHaveURL(/\/return\/done$/, { timeout: 60_000 });
  await expectHeading(page, 'تم ترحيل مرتجع البيع');
  await expect(page.locator('app-feedback-card').first()).toContainText('لا يوجد رد نقدي');
});
