import { expect, test } from '@playwright/test';
import { PASSWORD, USERS, expectHeading, named, toArabic } from './support';

test('asks for the business address first, then signs in, and goes back to it from sign-in @phone', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/connect$/);
  await expectHeading(page, 'Connect your business');
  await page.getByLabel('Workspace address *').fill('not an address');
  await page.getByRole('button', { name: 'Connect business' }).click();
  await expect(page.getByText('Enter an address like rehan.example.com.')).toBeVisible();
  // This Madar's own address: connected, and on to sign-in.
  await page.getByLabel('Workspace address *').fill(new URL(page.url()).host);
  await page.getByRole('button', { name: 'Connect business' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(named('Connected to', new URL(page.url()).host))).toBeVisible();

  await page.getByRole('button', { name: 'Change business' }).click();
  await expect(page).toHaveURL(/\/connect$/);
  await expect(page.getByLabel('Workspace address *')).toHaveValue(new URL(page.url()).origin);
  await page.getByRole('button', { name: 'Connect business' }).click();
  await page.getByLabel(/Email/).fill(USERS.owner);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await expectHeading(page, /^Good .*Rehan/);
});

test('the connect screen in Arabic, and sign-in remembers the business @desktop', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await expect(page).toHaveURL(/\/connect$/);
  await toArabic(page);
  await expectHeading(page, 'ربط منشأتك');
  await page.getByLabel('عنوان مساحة العمل *').fill(new URL(page.url()).host);
  await page.getByRole('button', { name: 'ربط المنشأة' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('button', { name: 'تغيير المنشأة' })).toBeVisible();
  // Connected once: the next visit goes straight to sign-in.
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('opens the page that was asked for once connected and signed in @desktop', async ({
  page,
}) => {
  await page.goto('/contacts?kind=suppliers');
  await expect(page).toHaveURL(/\/connect\?returnUrl=/);
  await page.getByLabel('Workspace address *').fill(new URL(page.url()).host);
  await page.getByRole('button', { name: 'Connect business' }).click();
  await expect(page).toHaveURL(/\/sign-in\?returnUrl=/);
  await page.getByLabel(/Email/).fill(USERS.owner);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await expect(page).toHaveURL(/\/contacts\?kind=suppliers$/);
});
