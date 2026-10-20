import { TestBed } from '@angular/core/testing';
import { LineRemoveComponent } from './line-remove.component';

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(LineRemoveComponent);
  const all = { label: 'Remove', name: 'Remove Olive tree', ...inputs };
  for (const [name, value] of Object.entries(all)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('LineRemoveComponent', () => {
  it('shows a Remove button named for the item and emits remove', async () => {
    const fixture = await render({});
    const el: HTMLElement = fixture.nativeElement;
    const removed: number[] = [];
    fixture.componentInstance.remove.subscribe(() => removed.push(1));

    const button = el.querySelector('button')!;
    button.click();

    expect(button.textContent?.trim()).toBe('Remove');
    expect(button.getAttribute('aria-label')).toBe('Remove Olive tree');
    expect(el.querySelectorAll('button').length).toBe(1);
    expect(removed).toEqual([1]);
  });

  it('shows the excluded state with an Add back button', async () => {
    const fixture = await render({
      excluded: true,
      excludedLabel: 'Not included',
      addBackLabel: 'Add back',
      addBackName: 'Add back Olive tree',
    });
    const el: HTMLElement = fixture.nativeElement;
    const added: number[] = [];
    fixture.componentInstance.addBack.subscribe(() => added.push(1));

    const button = el.querySelector('button')!;
    button.click();

    expect(el.querySelector('.excluded')?.textContent?.trim()).toBe('Not included');
    expect(button.textContent?.trim()).toBe('Add back');
    expect(button.getAttribute('aria-label')).toBe('Add back Olive tree');
    expect(el.querySelectorAll('button').length).toBe(1);
    expect(added).toEqual([1]);
  });
});
