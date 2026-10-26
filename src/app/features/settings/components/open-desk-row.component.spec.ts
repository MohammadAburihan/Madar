import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OpenDeskRowComponent } from './open-desk-row.component';

describe('OpenDeskRowComponent', () => {
  let fixture: ComponentFixture<OpenDeskRowComponent>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(OpenDeskRowComponent);
    fixture.componentRef.setInput('label', 'Open ERPNext');
    fixture.componentRef.setInput('hint', "Desk, ERPNext's full screens");
    fixture.componentRef.setInput('ariaLabel', 'Open ERPNext Desk');
    await fixture.whenStable();
  });

  it('shows the label, hint and external-link icon under an accessible name', () => {
    const button: HTMLElement = fixture.nativeElement.querySelector('button');
    expect(button.textContent).toContain('Open ERPNext');
    expect(button.textContent).toContain("Desk, ERPNext's full screens");
    expect(button.getAttribute('aria-label')).toBe('Open ERPNext Desk');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('emits open on click', () => {
    const opened = vi.fn();
    fixture.componentInstance.open.subscribe(opened);
    fixture.nativeElement.querySelector('button').click();

    expect(opened).toHaveBeenCalledTimes(1);
  });
});
