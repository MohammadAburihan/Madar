import { TestBed } from '@angular/core/testing';
import { AboutCardComponent } from './about-card.component';

describe('AboutCardComponent', () => {
  it('shows the title and the text with its line breaks', async () => {
    const fixture = TestBed.createComponent(AboutCardComponent);
    fixture.componentRef.setInput('title', 'About');
    fixture.componentRef.setInput('text', 'Clay pots\nand soil');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toBe('About');
    expect(el.querySelector('.text')?.textContent).toBe('Clay pots\nand soil');
    expect(el.querySelector('section')?.getAttribute('aria-label')).toBe('About');
  });
});
