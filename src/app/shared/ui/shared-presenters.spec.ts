import { TestBed } from '@angular/core/testing';
import { BusinessBarComponent } from './business-bar.component';
import { FeedbackCardComponent } from './feedback-card.component';

describe('Shared presenters', () => {
  it('FeedbackCard reflects its tone and announces non-neutral states', async () => {
    const fixture = TestBed.createComponent(FeedbackCardComponent);
    fixture.componentRef.setInput('title', 'Connection unavailable');
    fixture.componentRef.setInput('message', 'Check your connection.');
    fixture.componentRef.setInput('tone', 'warning');
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.classList).toContain('tone-warning');
    expect(host.getAttribute('role')).toBe('status');
    expect(host.querySelector('.title')?.textContent).toBe('Connection unavailable');

    fixture.componentRef.setInput('tone', 'tint');
    fixture.componentRef.setInput('message', null);
    await fixture.whenStable();
    expect(host.getAttribute('role')).toBeNull();
    expect(host.querySelector('.message')).toBeNull();
  });

  it('BusinessBar shows the business and emits switchBusiness', async () => {
    const fixture = TestBed.createComponent(BusinessBarComponent);
    fixture.componentRef.setInput('businessName', 'Rehan Nursery');
    fixture.componentRef.setInput('brand', 'Madar');
    fixture.componentRef.setInput('switchLabel', 'Switch business, current: Rehan Nursery');
    await fixture.whenStable();
    let switched = 0;
    fixture.componentInstance.switchBusiness.subscribe(() => switched++);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    button.click();

    expect(button.getAttribute('aria-label')).toBe('Switch business, current: Rehan Nursery');
    expect(button.textContent?.trim()).toBe('Rehan Nursery');
    expect(fixture.nativeElement.querySelector('.brand').textContent).toBe('Madar');
    expect(switched).toBe(1);
  });
});
