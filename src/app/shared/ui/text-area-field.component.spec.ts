import { TestBed } from '@angular/core/testing';
import { TextAreaFieldComponent } from './text-area-field.component';

async function field(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(TextAreaFieldComponent);
  for (const [key, value] of Object.entries({ label: 'About', ...inputs })) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('TextAreaFieldComponent', () => {
  it('shows the label, hint and value in a multi-line box', async () => {
    const f = await field({ value: 'Pots\nSoil', hint: 'What they supply' });
    const el = f.nativeElement as HTMLElement;
    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    expect(el.querySelector('.label')?.textContent).toBe('About');
    expect(el.querySelector('.hint')?.textContent).toBe('What they supply');
    expect(area.value).toBe('Pots\nSoil');
    expect(area.getAttribute('rows')).toBe('3');
  });

  it('writes typed text back to the value', async () => {
    const f = await field({});
    const area = (f.nativeElement as HTMLElement).querySelector('textarea') as HTMLTextAreaElement;
    area.value = 'Landscaper';
    area.dispatchEvent(new Event('input'));
    expect(f.componentInstance.value()).toBe('Landscaper');
  });

  it('is read-only when asked, and has no hint line without one', async () => {
    const f = await field({ readonly: true });
    const el = f.nativeElement as HTMLElement;
    expect((el.querySelector('textarea') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(el.querySelector('.hint')).toBeNull();
  });
});
