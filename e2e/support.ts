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
  // Connected to this business already, as after "Connect your business" (e2e/17-connect covers that screen).
  await page.addInitScript(() => {
    if (!localStorage.getItem('madar.connection')) {
      localStorage.setItem('madar.connection', location.origin);
    }
  });
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

/**
 * Keeps at least `atLeast` of an item in a warehouse (by its display name), receiving the shortfall through
 * ERPNext, so tests that sell or deliver don't run the shared test site's stock dry. Needs a signed-in owner.
 */
export async function topUp(page: Page, item: string, warehouse: string, atLeast: number) {
  const api = async <T>(path: string, params: Record<string, unknown>): Promise<T> => {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, JSON.stringify(v)]),
    );
    const response = await page.request.get(`/api/resource/${path}?${query}`);
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { data: T }).data;
  };
  const [target] = await api<{ name: string; company: string }[]>('Warehouse', {
    fields: ['name', 'company'],
    filters: [['warehouse_name', '=', warehouse]],
  });
  const [bin] = await api<{ actual_qty: number }[]>('Bin', {
    fields: ['actual_qty'],
    filters: [
      ['item_code', '=', item],
      ['warehouse', '=', target.name],
    ],
  });
  const short = atLeast - (bin?.actual_qty ?? 0);
  if (short <= 0) {
    return;
  }
  const post = async <T>(method: string, data: unknown): Promise<T> => {
    const response = await page.request.post(`/api/method/${method}`, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { message: T }).message;
  };
  const entry = await post<Record<string, unknown>>('frappe.client.insert', {
    doc: {
      doctype: 'Stock Entry',
      stock_entry_type: 'Material Receipt',
      company: target.company,
      items: [{ item_code: item, qty: short, t_warehouse: target.name, basic_rate: 40 }],
    },
  });
  await post('frappe.client.submit', { doc: entry });
}

/** ERPNext read straight through the dev server's proxy, as the signed-in user: the truth a screen must show. */
export function erp(page: Page) {
  const get = async <T>(path: string, params: Record<string, unknown>): Promise<T> => {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
    );
    const response = await page.request.get(`${path}?${query}`);
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: T }).data;
  };
  return {
    list: <T>(doctype: string, fields: string[], filters: unknown[] = [], extra = {}) =>
      get<T[]>(`/api/resource/${encodeURIComponent(doctype)}`, {
        fields,
        filters,
        limit_page_length: 0,
        ...extra,
      }),
    doc: <T>(doctype: string, name: string) =>
      get<T>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {}),
  };
}

/** "ILS 1,234.50", as Madar writes company-currency amounts. */
export const ils = (amount: number) =>
  `ILS ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A cell or label's text without the bidi isolates the app wraps around names. */
export const plain = (text: string) => text.replace(/[⁦-⁩]/g, '').trim();
