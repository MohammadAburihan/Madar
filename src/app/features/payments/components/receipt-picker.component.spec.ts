import { TestBed } from '@angular/core/testing';
import { ReceiptPickerComponent } from './receipt-picker.component';

describe('ReceiptPickerComponent', () => {
  const render = async (fileName: string | null = null) => {
    const fixture = TestBed.createComponent(ReceiptPickerComponent);
    fixture.componentRef.setInput('addLabel', 'Add receipt photo · optional');
    fixture.componentRef.setInput('changeLabel', 'Change receipt photo');
    fixture.componentRef.setInput('removeLabel', 'Remove receipt');
    fixture.componentRef.setInput('chosenLabel', 'Receipt: fuel.jpg');
    fixture.componentRef.setInput('fileName', fileName);
    await fixture.whenStable();
    return fixture;
  };

  it('offers to add a photo, from the camera or the gallery', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    expect([input.type, input.accept, input.getAttribute('capture')]).toEqual([
      'file',
      'image/*',
      'environment',
    ]);
    expect([...el.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual([
      'Add receipt photo · optional',
    ]);
  });

  it('emits the picked file', async () => {
    const fixture = await render();
    const picked: File[] = [];
    fixture.componentInstance.picked.subscribe((f) => picked.push(f));
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const file = new File(['x'], 'fuel.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(picked).toEqual([file]);
  });

  it('shows the chosen file and lets it be removed', async () => {
    const fixture = await render('fuel.jpg');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Receipt: fuel.jpg');
    let removed = 0;
    fixture.componentInstance.removed.subscribe(() => removed++);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      'Change receipt photo',
      'Remove receipt',
    ]);
    buttons[1].click();
    expect(removed).toBe(1);
  });
});
