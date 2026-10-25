import { Page, expect, test } from '@playwright/test';
import { answer, ask, bubbles, field, scriptAssistant } from './assistant-support';
import { signIn, toArabic } from './support';

declare global {
  interface Window {
    __speech: {
      langs: string[];
      stops: number;
      result(...parts: string[]): void;
      end(): void;
    };
    __spoken: { text: string; lang: string; voiceLang: string }[];
  }
}

/** A recognizer the test drives: it records the language it was given and says only what the test tells it to. */
async function fakeRecognizer(page: Page) {
  await page.addInitScript(() => {
    let current: any = null;
    const control = {
      langs: [] as string[],
      stops: 0,
      result: (...parts: string[]) =>
        current?.onresult({ results: parts.map((transcript) => [{ transcript }]) }),
      end: () => current?.onend(),
    };
    class FakeRecognition {
      lang = '';
      onresult: any = null;
      onerror: any = null;
      onend: any = null;
      start() {
        current = this;
        control.langs.push(this.lang);
      }
      stop() {
        control.stops++;
        this.onend?.();
      }
    }
    (window as any).webkitSpeechRecognition = FakeRecognition;
    (window as any).SpeechRecognition = undefined;
    window.__speech = control;
  });
}

async function withoutRecognizer(page: Page) {
  await page.addInitScript(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });
}

/** A speechSynthesis with an Arabic and an English voice that records what it is asked to say. */
async function fakeVoices(page: Page) {
  await page.addInitScript(() => {
    const voices = [
      { lang: 'en-US', name: 'Fake English' },
      { lang: 'ar-SA', name: 'Fake Arabic' },
    ];
    window.__spoken = [];
    (window as any).__keepVoices = true;
    // The real utterance refuses a voice object it did not create.
    (window as any).SpeechSynthesisUtterance = class {
      lang = '';
      voice: unknown = null;
      constructor(readonly text: string) {}
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        addEventListener: () => undefined,
        cancel: () => undefined,
        speak: (utterance: any) =>
          window.__spoken.push({
            text: utterance.text,
            lang: utterance.lang,
            voiceLang: utterance.voice?.lang,
          }),
      },
    });
  });
}

const mic = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const say = (page: Page, ...parts: string[]) =>
  page.evaluate((p) => window.__speech.result(...p), parts);
const finish = (page: Page) => page.evaluate(() => window.__speech.end());

test('speaks a question into the field, and sends only when Send is pressed @phone', async ({
  page,
}) => {
  await fakeRecognizer(page);
  await signIn(page, 'owner');
  const requests = await scriptAssistant(page, [
    () => ({ body: answer('Nobody owes money today.') }),
  ]);
  await page.goto('/assistant');

  await expect(mic(page, 'Speak')).toBeVisible();
  await expect(page.locator('app-assistant-composer .listening')).toHaveCount(0);
  await mic(page, 'Speak').click();
  await expect(mic(page, 'Stop listening')).toBeVisible();
  await expect(page.locator('app-assistant-composer .listening')).toHaveText(
    'Listening… speak in Arabic or English',
  );
  expect(await page.evaluate(() => window.__speech.langs)).toEqual(['en-US']);

  await say(page, 'who owes');
  await expect(field(page)).toHaveValue('who owes');
  await say(page, 'who owes', 'money today');
  await expect(field(page)).toHaveValue('who owes money today');
  await finish(page);
  await expect(mic(page, 'Speak')).toBeVisible();
  await expect(page.locator('app-assistant-composer .listening')).toHaveCount(0);

  expect(requests).toHaveLength(0);
  await expect(bubbles(page, 'user')).toHaveCount(0);
  await expect(field(page)).toHaveValue('who owes money today');
  await field(page).fill('Who owes money today?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(bubbles(page, 'user')).toHaveText('Who owes money today?');
  await expect(bubbles(page, 'assistant')).toHaveText('Nobody owes money today.');
  expect(requests).toHaveLength(1);
  expect(requests[0].messages[0]).toEqual({ role: 'user', content: 'Who owes money today?' });
});

test('stops listening when the mic is pressed again, and keeps the text @desktop', async ({
  page,
}) => {
  await fakeRecognizer(page);
  await signIn(page, 'owner');
  const requests = await scriptAssistant(page, [() => ({ body: answer('Done.') })]);
  await page.goto('/assistant');
  await field(page).fill('Low stock');
  await mic(page, 'Speak').click();
  await say(page, 'items please');
  await expect(field(page)).toHaveValue('Low stock items please');
  await mic(page, 'Stop listening').click();
  await expect(mic(page, 'Speak')).toBeVisible();
  expect(await page.evaluate(() => window.__speech.stops)).toBe(1);
  await expect(field(page)).toHaveValue('Low stock items please');
  expect(requests).toHaveLength(0);
});

test('listens in Arabic with an Arabic tag, and names its controls in Arabic @phone', async ({
  page,
}) => {
  await fakeRecognizer(page);
  await signIn(page, 'owner');
  const requests = await scriptAssistant(page, [
    () => ({ body: answer('لا توجد مبيعات اليوم بعد.') }),
  ]);
  await page.goto('/assistant');
  await toArabic(page);
  await mic(page, 'تحدّث').click();
  await expect(mic(page, 'إيقاف الاستماع')).toBeVisible();
  await expect(page.locator('app-assistant-composer .listening')).toHaveText(
    'أستمع… تحدّث بالعربية أو الإنجليزية',
  );
  expect(await page.evaluate(() => window.__speech.langs)).toEqual(['ar-SA']);
  await say(page, 'مبيعات اليوم');
  await finish(page);
  await expect(field(page)).toHaveValue('مبيعات اليوم');
  expect(requests).toHaveLength(0);
  await ask(page, 'مبيعات اليوم');
  await expect(bubbles(page, 'assistant')).toHaveText('لا توجد مبيعات اليوم بعد.');
});

test('shows the notice when nothing was heard, in Arabic too @desktop', async ({ page }) => {
  await fakeRecognizer(page);
  await signIn(page, 'owner');
  await page.goto('/assistant');
  await toArabic(page);
  await mic(page, 'تحدّث').click();
  await finish(page);
  await expect(page.locator('app-feedback-card')).toContainText(
    'لم أتمكن من السماع. حاول مرة أخرى.',
  );
  await expect(mic(page, 'تحدّث')).toBeVisible();
});

test('has no microphone button where the browser cannot recognise speech @phone', async ({
  page,
}) => {
  await withoutRecognizer(page);
  await signIn(page, 'owner');
  await page.goto('/assistant');
  await expect(field(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  await expect(page.locator('app-assistant-composer button.mic')).toHaveCount(0);
});

test('has no microphone button without recognition on desktop either @desktop', async ({
  page,
}) => {
  await withoutRecognizer(page);
  await signIn(page, 'owner');
  await page.goto('/assistant');
  await expect(field(page)).toBeVisible();
  await expect(page.locator('app-assistant-composer button.mic')).toHaveCount(0);
});

test('reads a reply aloud as plain text with the voice of its language @desktop', async ({
  page,
}) => {
  await fakeVoices(page);
  await signIn(page, 'owner');
  await scriptAssistant(page, [
    () => ({ body: answer('Lina owes **ILS 250.00**.\n- Pots: 2\n- Seed mix: 0') }),
  ]);
  await page.goto('/assistant');
  await ask(page, 'Who owes money?');
  await expect(bubbles(page, 'assistant')).toContainText('Lina owes');
  const read = page.getByRole('button', { name: 'Read aloud', exact: true });
  await expect(read).toHaveCount(1);
  await expect(bubbles(page, 'user').getByRole('button', { name: 'Read aloud' })).toHaveCount(0);
  await read.click();
  await expect(read).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__spoken)).toEqual([
    {
      text: 'Lina owes ILS 250.00.\n\nPots: 2\nSeed mix: 0',
      lang: 'en-US',
      voiceLang: 'en-US',
    },
  ]);
  await read.click();
  await expect(read).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__spoken.length)).toBe(1);
});

test('reads an Arabic reply with an Arabic voice @phone', async ({ page }) => {
  await fakeVoices(page);
  await signIn(page, 'owner');
  await scriptAssistant(page, [() => ({ body: answer('لا توجد **مبيعات** اليوم بعد.') })]);
  await page.goto('/assistant');
  await toArabic(page);
  await ask(page, 'مبيعات اليوم');
  await page.getByRole('button', { name: 'قراءة بصوت عالٍ', exact: true }).click();
  expect(await page.evaluate(() => window.__spoken)).toEqual([
    { text: 'لا توجد مبيعات اليوم بعد.', lang: 'ar-SA', voiceLang: 'ar-SA' },
  ]);
});

test('hides Read aloud when the browser has no voice for the reply @phone', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__keepVoices = true;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { getVoices: () => [], addEventListener: () => undefined, cancel: () => undefined },
    });
  });
  await signIn(page, 'owner');
  await scriptAssistant(page, [() => ({ body: answer('Nothing yet.') })]);
  await page.goto('/assistant');
  await ask(page, 'Sales?');
  await expect(bubbles(page, 'assistant')).toHaveText('Nothing yet.');
  await expect(page.getByRole('button', { name: 'Read aloud' })).toHaveCount(0);
});
