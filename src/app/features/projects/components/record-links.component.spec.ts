import { TestBed } from '@angular/core/testing';
import { RecordLinksComponent } from './record-links.component';

describe('RecordLinksComponent', () => {
  it('opens the records that have a page, and shows the others as text', async () => {
    const fixture = TestBed.createComponent(RecordLinksComponent);
    fixture.componentRef.setInput('heading', 'Project records');
    fixture.componentRef.setInput('links', [
      { id: 'sale:S-042', label: 'Sale · S-042', openable: true },
      { id: 'expense:EX-019', label: 'Expense · EX-019', openable: false },
    ]);
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('h2')?.textContent).toBe('Project records');
    const buttons = host.querySelectorAll('button');
    expect(Array.from(buttons).map((b) => b.textContent?.trim())).toEqual(['Sale · S-042']);
    expect(host.querySelector('.static')?.textContent?.trim()).toBe('Expense · EX-019');
    buttons[0].click();
    expect(opened).toEqual(['sale:S-042']);
  });

  it('says when there are no records', async () => {
    const fixture = TestBed.createComponent(RecordLinksComponent);
    fixture.componentRef.setInput('heading', 'Project records');
    fixture.componentRef.setInput('links', []);
    fixture.componentRef.setInput('empty', 'No linked records.');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.empty')?.textContent).toBe('No linked records.');
  });
});
