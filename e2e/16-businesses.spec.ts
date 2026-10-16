import { expect, test } from '@playwright/test';
import { expectHeading, named, signIn, toArabic } from './support';

test('saves another business’s Madar address and opens it from Your businesses @phone', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add another business' }).click();
  await expect(page).toHaveURL(/\/businesses$/);
  await expectHeading(page, 'Your businesses');
  await expect(page.locator('app-feedback-card').first()).toContainText('Rehan Nursery');
  await expect(page.locator('app-feedback-card').first()).toContainText(
    named('Current business ·', 'Owner'),
  );
  await page.getByRole('button', { name: 'Add business connection' }).click();
  await page.getByLabel('Workspace address').fill('localhost');
  await page.getByRole('button', { name: 'Save business' }).click();
  await expect(page.getByText('Enter an address like padel.example.com.')).toBeVisible();
  await page.getByLabel('Workspace address').fill('padel.example.com');
  await page.getByRole('button', { name: 'Save business' }).click();
  const open = page.getByRole('button', { name: named('Open', 'padel.example.com') });
  await expect(open).toBeVisible();

  // Saved on the device: still there on the next visit.
  await page.reload();
  await expect(open).toBeVisible();
  await toArabic(page);
  await expectHeading(page, 'منشآتك');
  await page.getByRole('button', { name: named('إزالة', 'padel.example.com') }).click();
  await expect(page.getByRole('button', { name: named('فتح', 'padel.example.com') })).toHaveCount(
    0,
  );
});
