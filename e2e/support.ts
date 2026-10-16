import { Locator, Page, expect } from '@playwright/test';

/** Seeded test-site users (scripts/dev-test-site.sh); one per Madar role. */
export const USERS = {
  owner: 'rehan@rehan.example',
  salesperson: 'lina@rehan.example',
  storeAssociate: 'sami@rehan.example',
  warehouse: 'omar@rehan.example',
  purchasing: 'nadia@rehan.example',
  projectManager: 'yara@rehan.example',
} as const;
export const PASSWORD = 'Madar-Dev-2026';

export const ITEM = { code: 'POT-30', name: 'Ceramic planter' };
export const SUPPLIER = 'Green Clay';
export const CUSTOMER = 'Lina Haddad';
export const MAIN = 'Main warehouse';

export async function signIn(page: Page, user: keyof typeof USERS = 'owner'): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel(/Email/).fill(USERS[user]);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
}

/** The page's main heading, whichever layout renders it. */
export const heading = (page: Page) => page.getByRole('heading', { level: 1 }).first();

export async function expectHeading(page: Page, text: string | RegExp): Promise<void> {
  await expect(heading(page)).toHaveText(text);
}

export async function toArabic(page: Page): Promise<void> {
  await page.locator('button.md-btn--language:visible').first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
}

/** A unique suffix so repeated runs never collide on names or references. */
export const runId = () => Date.now().toString(36).slice(-5).toUpperCase();

/** Picks the first option whose text starts with `text` (labels often add details, "Green Clay · Hebron"). */
export async function choose(select: Locator, text: string): Promise<void> {
  await expect(select.locator('option', { hasText: text }).first()).toBeAttached();
  const value = await select.evaluate(
    (el, start) =>
      [...(el as HTMLSelectElement).options].find((o) =>
        o.text
          .replace(/[\u2066-\u2069]/g, '')
          .trim()
          .startsWith(start),
      )?.value ?? null,
    text,
  );
  expect(value, `an option starting with "${text}"`).not.toBeNull();
  await select.selectOption(value!);
  await expect(select).toHaveValue(value!);
}

/** A name pattern that ignores the bidi isolates the app wraps around interpolated names. */
export function named(...parts: string[]): RegExp {
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('[\\s\u2066-\u2069]*'));
}
