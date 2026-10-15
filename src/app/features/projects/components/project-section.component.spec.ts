import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectSectionComponent } from './project-section.component';

describe('ProjectSectionComponent', () => {
  const render = async (inputs: Record<string, unknown>) => {
    const fixture = TestBed.createComponent(ProjectSectionComponent);
    fixture.componentRef.setInput('heading', 'Next tasks');
    fixture.componentRef.setInput('empty', 'No open tasks.');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows its items under the heading', async () => {
    const el = await render({
      items: [{ title: 'Prepare planting beds', message: '12 Oct · Salim' }],
    });
    expect(el.querySelector('h2')?.textContent).toBe('Next tasks');
    expect(el.querySelector('.item strong')?.textContent).toBe('Prepare planting beds');
    expect(el.querySelector('.empty')).toBeNull();
  });

  it('flags a short requirement row', async () => {
    const el = await render({
      rows: [
        { label: 'Ceramic planters · POT-30', status: '12 needed · 8 available', short: true },
      ],
    });
    expect(el.querySelector('.row')?.textContent).toContain('12 needed · 8 available');
  });

  it('says when there is nothing to show', async () => {
    const el = await render({});
    expect(el.querySelector('.empty')?.textContent).toBe('No open tasks.');
  });

  it('shows projected content when told it has some', async () => {
    @Component({
      imports: [ProjectSectionComponent],
      template: `<app-project-section heading="Linked records" empty="None" [hasContent]="true"
        ><i>SI-042</i></app-project-section
      >`,
    })
    class Host {}
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.box i')?.textContent).toBe(
      'SI-042',
    );
  });
});
