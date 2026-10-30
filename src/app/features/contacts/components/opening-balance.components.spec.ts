import { TestBed } from '@angular/core/testing';
import { OpeningBalanceFormComponent } from './opening-balance-form.component';
import { OpeningBalanceResultComponent } from './opening-balance-result.component';
import { OpeningBalanceReviewComponent } from './opening-balance-review.component';

async function render<T>(
  component: new () => T,
  inputs: Record<string, unknown>,
): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<T>>; el: HTMLElement }> {
  const fixture = TestBed.createComponent(component);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const buttons = (el: HTMLElement) => [...el.querySelectorAll('button')];

describe('OpeningBalanceFormComponent', () => {
  const text = {
    intro: 'Money owed before Madar.',
    amount: 'Amount *',
    date: 'Date *',
    dateHint: 'Today or earlier.',
    dateError: 'Pick today or an earlier date',
    note: 'Note (optional)',
    review: 'Review',
  };

  it('shows the intro, the three fields, the currency and the Review button', async () => {
    const { el } = await render(OpeningBalanceFormComponent, { text, currency: 'ILS' });
    expect(el.textContent).toContain('Money owed before Madar.');
    expect(el.querySelectorAll('app-text-field')).toHaveLength(2);
    expect(el.querySelector('app-text-area-field')).not.toBeNull();
    expect(el.textContent).toContain('ILS');
    expect(el.textContent).toContain('Today or earlier.');
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual(['Review']);
  });

  it('types the amount left to right and emits what is typed', async () => {
    const { fixture, el } = await render(OpeningBalanceFormComponent, { text, currency: 'ILS' });
    const changed = vi.fn();
    fixture.componentInstance.amount.subscribe(changed);
    const amount = el.querySelector('app-text-field input') as HTMLInputElement;
    expect(amount.getAttribute('dir')).toBe('ltr');
    amount.value = '٣٠٠٫٥';
    amount.dispatchEvent(new Event('input'));
    expect(changed).toHaveBeenCalledWith('٣٠٠٫٥');
  });

  it('says what is wrong only after Review was tapped, and emits review', async () => {
    const { fixture, el } = await render(OpeningBalanceFormComponent, {
      text,
      currency: 'ILS',
      amountError: 'Enter an amount above 0',
      dateValid: false,
    });
    expect(el.textContent).not.toContain('Enter an amount above 0');
    const review = vi.fn();
    fixture.componentInstance.review.subscribe(review);
    buttons(el)[0].click();
    expect(review).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('showErrors', true);
    await fixture.whenStable();
    expect(el.textContent).toContain('Enter an amount above 0');
    expect(el.textContent).toContain('Pick today or an earlier date');
  });

  it('makes the fields read-only while locked', async () => {
    const { el } = await render(OpeningBalanceFormComponent, {
      text,
      currency: 'ILS',
      locked: true,
    });
    const fields = [...el.querySelectorAll('input, textarea')] as HTMLInputElement[];
    expect(fields).toHaveLength(3);
    expect(fields.every((f) => f.readOnly)).toBe(true);
  });
});

describe('OpeningBalanceReviewComponent', () => {
  const inputs = {
    text: {
      ready: 'Ready to record',
      record: 'Record opening balance',
      recording: 'Recording…',
      edit: 'Edit',
      startOver: 'Start over',
      reference: 'Reference OPN-0A1B2C3',
    },
    title: 'Lina owes you ILS 250.00',
    message: 'Not a sale.',
    rows: [{ label: 'Amount', value: 'ILS 250.00' }],
  };

  it('shows the card, the rows and the reference', async () => {
    const { el } = await render(OpeningBalanceReviewComponent, inputs);
    expect(el.textContent).toContain('Ready to record');
    expect(el.textContent).toContain('Lina owes you ILS 250.00');
    expect(el.textContent).toContain('Not a sale.');
    expect(el.textContent).toContain('ILS 250.00');
    expect(el.textContent).toContain('Reference OPN-0A1B2C3');
  });

  it('emits record and edit', async () => {
    const { fixture, el } = await render(OpeningBalanceReviewComponent, inputs);
    const record = vi.fn();
    const edit = vi.fn();
    fixture.componentInstance.record.subscribe(record);
    fixture.componentInstance.edit.subscribe(edit);
    const [first, second] = buttons(el);
    expect(first.textContent?.trim()).toBe('Record opening balance');
    first.click();
    second.click();
    expect(record).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while recording', async () => {
    const { el } = await render(OpeningBalanceReviewComponent, { ...inputs, busy: true });
    expect(buttons(el).every((b) => b.disabled)).toBe(true);
    expect(buttons(el)[0].textContent?.trim()).toBe('Recording…');
  });

  it('offers Start over only when asked to, and emits it', async () => {
    const { fixture, el } = await render(OpeningBalanceReviewComponent, inputs);
    expect(buttons(el).map((b) => b.textContent?.trim())).not.toContain('Start over');
    fixture.componentRef.setInput('canStartOver', true);
    await fixture.whenStable();
    const startOver = vi.fn();
    fixture.componentInstance.startOver.subscribe(startOver);
    buttons(el)
      .find((b) => b.textContent?.trim() === 'Start over')
      ?.click();
    expect(startOver).toHaveBeenCalledTimes(1);
  });

  it('hides Edit once the details can no longer change', async () => {
    const { el } = await render(OpeningBalanceReviewComponent, { ...inputs, canEdit: false });
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual(['Record opening balance']);
  });
});

describe('OpeningBalanceResultComponent', () => {
  it('shows the result and emits viewInvoice and done', async () => {
    const { fixture, el } = await render(OpeningBalanceResultComponent, {
      text: { recorded: 'Recorded', viewInvoice: 'View invoice', done: 'Back to Lina' },
      title: 'ILS 250.00 opening balance recorded',
      message: 'Invoice ACC-SINV-1 is dated 3 Jan 2026.',
    });
    expect(el.textContent).toContain('Recorded');
    expect(el.textContent).toContain('ILS 250.00 opening balance recorded');
    expect(el.textContent).toContain('ACC-SINV-1');
    const view = vi.fn();
    const done = vi.fn();
    fixture.componentInstance.viewInvoice.subscribe(view);
    fixture.componentInstance.done.subscribe(done);
    const [first, second] = buttons(el);
    first.click();
    second.click();
    expect(view).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(first.textContent?.trim()).toBe('View invoice');
  });
});
