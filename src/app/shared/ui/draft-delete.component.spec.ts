import { TestBed } from '@angular/core/testing';
import { DraftDeleteComponent } from './draft-delete.component';

const DIALOG = {
  title: 'Delete this draft?',
  message: "Sale for Lina Haddad will be deleted. This can't be undone.",
  confirm: 'Delete',
  keep: 'Keep',
};

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(DraftDeleteComponent);
  const base = { label: 'Delete draft', busyLabel: 'Deleting…', canDelete: true, ...inputs };
  for (const [key, value] of Object.entries(base)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

describe('DraftDeleteComponent', () => {
  beforeEach(() => {
    // jsdom has no modal dialogs.
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  it('shows a danger Delete button that asks for the confirmation', async () => {
    const fixture = await render();
    const asked = vi.fn();
    fixture.componentInstance.asked.subscribe(asked);

    const button = fixture.nativeElement.querySelector(
      'button.md-btn--danger',
    ) as HTMLButtonElement;
    expect(text(button)).toBe('Delete draft');
    button.click();

    expect(asked).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
  });

  it('hides the button when the user may not delete, but still shows an earlier failure', async () => {
    const fixture = await render({
      canDelete: false,
      problem: { title: 'Already confirmed or gone', message: 'Nothing was deleted.' },
    });
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(text(fixture.nativeElement.querySelector('app-feedback-card'))).toContain(
      'Already confirmed or gone',
    );
  });

  it('shows nothing at all when there is nothing to show', async () => {
    const fixture = await render({ canDelete: false });
    expect(text(fixture.nativeElement)).toBe('');
  });

  it('disables the button and says Deleting while it runs', async () => {
    const fixture = await render({ busy: true });
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect([text(button), button.disabled]).toEqual(['Deleting…', true]);
  });

  it('opens the dialog with Delete and Keep, and reports the choice', async () => {
    const fixture = await render({ dialog: DIALOG, open: true });
    const chosen: string[] = [];
    fixture.componentInstance.chosen.subscribe((id) => chosen.push(id));

    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(text(dialog.querySelector('h2'))).toBe('Delete this draft?');
    expect(text(dialog.querySelector('p'))).toBe(DIALOG.message);
    const buttons = [...dialog.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.map(text)).toEqual(['Delete', 'Keep']);
    expect(buttons.map((b) => b.classList.contains('md-btn--danger'))).toEqual([true, false]);

    buttons[0].click();
    buttons[1].click();
    expect(chosen).toEqual(['delete', 'keep']);
  });
});
