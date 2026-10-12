import { TestBed } from '@angular/core/testing';
import { ActionGridComponent } from './action-grid.component';

describe('ActionGridComponent', () => {
  const render = async (count: number, columns: number) => {
    const fixture = TestBed.createComponent(ActionGridComponent);
    fixture.componentRef.setInput(
      'actions',
      Array.from({ length: count }, (_, i) => ({ id: `a${i}`, label: `Action ${i}` })),
    );
    fixture.componentRef.setInput('columns', columns);
    await fixture.whenStable();
    return fixture;
  };

  it('stretches a lone last action across the row, as in the mocks', async () => {
    const fixture = await render(7, 3);
    const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];

    expect(buttons.map((b) => b.classList.contains('span-all'))).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('keeps full rows untouched and emits the chosen action', async () => {
    const fixture = await render(4, 2);
    const emitted: string[] = [];
    fixture.componentInstance.actionSelected.subscribe((id) => emitted.push(id));
    const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];

    buttons[2].click();

    expect(buttons.some((b) => b.classList.contains('span-all'))).toBe(false);
    expect(emitted).toEqual(['a2']);
  });
});
