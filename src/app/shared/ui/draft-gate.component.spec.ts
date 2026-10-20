import { TestBed } from '@angular/core/testing';
import { DraftGateComponent } from './draft-gate.component';

const INPUTS = {
  loading: 'Opening your draft…',
  title: "This draft can't be continued",
  message: 'It may have been confirmed or deleted.',
  backLabel: 'Back to drafts',
};
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(DraftGateComponent);
  for (const [name, value] of Object.entries({ ...INPUTS, ...inputs })) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('DraftGateComponent', () => {
  it('shows only a status while the draft loads', async () => {
    const fixture = await render({ failed: false });
    const el: HTMLElement = fixture.nativeElement;
    expect(text(el.querySelector('[role=status]'))).toBe('Opening your draft…');
    expect(el.querySelector('button')).toBeNull();
  });

  it('shows the failure with a way back, and a retry only when offered', async () => {
    const fixture = await render({ failed: true });
    const el: HTMLElement = fixture.nativeElement;
    const back: number[] = [];
    fixture.componentInstance.back.subscribe(() => back.push(1));

    expect(text(el)).toContain("This draft can't be continued");
    expect([...el.querySelectorAll('button')].map(text)).toEqual(['Back to drafts']);
    el.querySelector('button')!.click();
    expect(back).toEqual([1]);

    fixture.componentRef.setInput('retryLabel', 'Try again');
    await fixture.whenStable();
    const retried: number[] = [];
    fixture.componentInstance.retry.subscribe(() => retried.push(1));
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map(text)).toEqual(['Try again', 'Back to drafts']);
    buttons[0].click();
    expect(retried).toEqual([1]);
  });
});
