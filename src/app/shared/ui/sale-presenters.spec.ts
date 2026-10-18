import { TestBed } from '@angular/core/testing';
import { BackLinkComponent } from './back-link.component';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { FilterChipsComponent } from './filter-chips.component';
import { ItemCardComponent } from './item-card.component';
import { PageHeadingComponent } from './page-heading.component';
import { PersonCardComponent } from './person-card.component';
import { QuantityStepperComponent } from './quantity-stepper.component';
import { SearchFieldComponent } from './search-field.component';
import { SelectFieldComponent } from './select-field.component';
import { StatusChipComponent } from './status-chip.component';
import { TextFieldComponent } from './text-field.component';
import { TotalsCardComponent } from './totals-card.component';

const text = (host: HTMLElement, selector: string) =>
  host.querySelector(selector)?.textContent?.trim();

describe('Sale presenters', () => {
  it('QuantityStepper shows the quantity and emits the next value', async () => {
    const fixture = TestBed.createComponent(QuantityStepperComponent);
    fixture.componentRef.setInput('value', 2);
    fixture.componentRef.setInput('label', 'Quantity of Olive tree');
    fixture.componentRef.setInput('decreaseLabel', 'Decrease');
    fixture.componentRef.setInput('increaseLabel', 'Increase');
    await fixture.whenStable();
    const values: number[] = [];
    fixture.componentInstance.changed.subscribe((v) => values.push(v));
    const host: HTMLElement = fixture.nativeElement;
    const [minus, plus] = Array.from(host.querySelectorAll('button'));

    minus.click();
    plus.click();

    expect(text(host, 'output')).toBe('2');
    expect(host.querySelector('[role=group]')?.getAttribute('aria-label')).toBe(
      'Quantity of Olive tree',
    );
    expect(minus.getAttribute('aria-label')).toBe('Decrease');
    expect(values).toEqual([1, 3]);
  });

  it('ItemCard renders the item, and is a button only when interactive', async () => {
    const fixture = TestBed.createComponent(ItemCardComponent);
    fixture.componentRef.setInput('title', 'Garden consultation');
    fixture.componentRef.setInput('meta', 'SRV-GARDEN · Visit');
    fixture.componentRef.setInput('detail', 'ILS 150.00 · Service');
    fixture.componentRef.setInput('kind', 'service');
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('button')).toBeNull();
    expect(text(host, '.title')).toBe('Garden consultation');
    expect(text(host, '.meta')).toBe('SRV-GARDEN · Visit');
    expect(text(host, '.detail')).toBe('ILS 150.00 · Service');

    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('meta', null);
    await fixture.whenStable();
    let selected = 0;
    fixture.componentInstance.selected.subscribe(() => selected++);
    host.querySelector('button')!.click();
    expect(selected).toBe(1);
    expect(host.classList).toContain('interactive');
    expect(host.querySelector('.meta')).toBeNull();
  });

  it('SelectField shows the placeholder until a value is chosen, and updates its value', async () => {
    const fixture = TestBed.createComponent(SelectFieldComponent);
    fixture.componentRef.setInput('label', 'Fulfillment warehouse');
    fixture.componentRef.setInput('placeholder', 'Choose a warehouse');
    fixture.componentRef.setInput('options', [
      { value: 'Main - RN', label: 'Main warehouse' },
      { value: 'Garden - RN', label: 'Garden shop' },
    ]);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const select = host.querySelector('select')!;

    expect(text(host, '.label')).toBe('Fulfillment warehouse');
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual([
      'Choose a warehouse',
      'Main warehouse',
      'Garden shop',
    ]);
    expect(select.options[0].disabled).toBe(true);

    select.value = 'Garden - RN';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.value()).toBe('Garden - RN');

    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(select.disabled).toBe(true);
  });

  it('TextField binds its value and shows an error before the hint', async () => {
    const fixture = TestBed.createComponent(TextFieldComponent);
    fixture.componentRef.setInput('label', 'Discount');
    fixture.componentRef.setInput('suffix', '%');
    fixture.componentRef.setInput('hint', 'Your role can give up to 10% discount.');
    fixture.componentRef.setInput('ltr', true);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const input = host.querySelector('input')!;

    input.value = '5';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.value()).toBe('5');
    expect(input.getAttribute('dir')).toBe('ltr');
    expect(text(host, '.suffix')).toBe('%');
    expect(text(host, '.hint')).toBe('Your role can give up to 10% discount.');

    fixture.componentRef.setInput('error', 'Enter a discount from 0 to 10%.');
    fixture.componentRef.setInput('readonly', true);
    await fixture.whenStable();
    expect(host.querySelector('.hint')).toBeNull();
    expect(host.querySelector('[role=alert]')?.textContent?.trim()).toBe(
      'Enter a discount from 0 to 10%.',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.readOnly).toBe(true);
  });

  it('StatusChip shows its label in its tone', async () => {
    const fixture = TestBed.createComponent(StatusChipComponent);
    fixture.componentRef.setInput('label', 'Payment: Partially paid');
    fixture.componentRef.setInput('tone', 'warning');
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent?.trim()).toBe('Payment: Partially paid');
    expect(host.classList).toContain('tone-warning');
  });

  it('TotalsCard lists each row with its amount kept LTR', async () => {
    const fixture = TestBed.createComponent(TotalsCardComponent);
    fixture.componentRef.setInput('rows', [
      { label: 'Invoice total', value: 'ILS 320.00' },
      { label: 'Outstanding', value: 'ILS 200.00' },
    ]);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(Array.from(host.querySelectorAll('dt')).map((d) => d.textContent?.trim())).toEqual([
      'Invoice total',
      'Outstanding',
    ]);
    expect(host.querySelector('dd bdi')?.getAttribute('dir')).toBe('ltr');
    expect(text(host, 'dd')).toBe('ILS 320.00');
  });

  it('FilterChips marks the chosen chip and changes it on click', async () => {
    const fixture = TestBed.createComponent(FilterChipsComponent);
    fixture.componentRef.setInput('label', 'Filter');
    fixture.componentRef.setInput('options', [
      { value: 'all', label: 'All' },
      { value: 'services', label: 'Services' },
    ]);
    fixture.componentRef.setInput('value', 'all');
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const [all, services] = Array.from(host.querySelectorAll('button'));

    expect(all.getAttribute('aria-checked')).toBe('true');
    services.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('services');
    expect(services.getAttribute('aria-checked')).toBe('true');
    expect(all.getAttribute('aria-checked')).toBe('false');
  });

  it('PersonCard shows the customer and emits picked', async () => {
    const fixture = TestBed.createComponent(PersonCardComponent);
    fixture.componentRef.setInput('title', 'Lina Haddad');
    fixture.componentRef.setInput('meta', '059-000-0142 · Ramallah');
    fixture.componentRef.setInput('balance', 'No previous unpaid invoices');
    fixture.componentRef.setInput('selected', true);
    await fixture.whenStable();
    let picked = 0;
    fixture.componentInstance.picked.subscribe(() => picked++);
    const host: HTMLElement = fixture.nativeElement;
    const button = host.querySelector('button')!;

    button.click();

    expect(text(host, '.title')).toBe('Lina Haddad');
    expect(text(host, '.meta')).toBe('059-000-0142 · Ramallah');
    expect(text(host, '.balance')).toBe('No previous unpaid invoices');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(picked).toBe(1);
  });

  it('ConfirmDialog opens as a modal and emits the chosen action, or the cancel action on Escape', async () => {
    const proto = HTMLDialogElement.prototype;
    proto.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentRef.setInput('title', 'Leave this sale?');
    fixture.componentRef.setInput('message', 'Your basket is not saved.');
    fixture.componentRef.setInput('actions', [
      { id: 'save', label: 'Save draft', primary: true },
      { id: 'discard', label: 'Discard' },
      { id: 'stay', label: 'Stay' },
    ]);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const dialog = host.querySelector('dialog')!;
    const chosen: string[] = [];
    fixture.componentInstance.chosen.subscribe((id) => chosen.push(id));

    expect(dialog.open).toBe(false);
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(text(host, 'h2')).toBe('Leave this sale?');
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons[0].classList).toContain('md-btn--primary');

    buttons[1].click();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(chosen).toEqual(['discard', 'stay']);

    fixture.componentRef.setInput('open', false);
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
  });

  it('SearchField emits the term on Enter and arrowDown on the down key', async () => {
    const fixture = TestBed.createComponent(SearchFieldComponent);
    fixture.componentRef.setInput('label', 'Search');
    fixture.componentRef.setInput('placeholder', 'Search name, code or barcode');
    await fixture.whenStable();
    const submitted: string[] = [];
    let down = 0;
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
    fixture.componentInstance.arrowDown.subscribe(() => down++);
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');

    input.value = 'olive';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(input.placeholder).toBe('Search name, code or barcode');
    expect(submitted).toEqual(['olive']);
    expect(down).toBe(1);
  });

  it('BackLink and PageHeading render their text and BackLink emits back', async () => {
    const back = TestBed.createComponent(BackLinkComponent);
    back.componentRef.setInput('label', 'Back');
    await back.whenStable();
    let went = 0;
    back.componentInstance.back.subscribe(() => went++);
    back.nativeElement.querySelector('button').click();
    expect(went).toBe(1);
    expect(back.nativeElement.textContent.trim()).toBe('Back');

    const heading = TestBed.createComponent(PageHeadingComponent);
    heading.componentRef.setInput('title', 'New sale');
    heading.componentRef.setInput('subtitle', '1 of 4 · Customer');
    await heading.whenStable();
    expect(text(heading.nativeElement, 'h1')).toBe('New sale');
    expect(heading.nativeElement.textContent).toContain('1 of 4 · Customer');
  });
});
