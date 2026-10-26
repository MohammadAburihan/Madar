import { TestBed } from '@angular/core/testing';
import { ProjectSellComponent } from './project-sell.component';

describe('ProjectSellComponent', () => {
  const render = async (inputs: Record<string, unknown>) => {
    const fixture = TestBed.createComponent(ProjectSellComponent);
    fixture.componentRef.setInput('heading', 'Sell to this project');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('shows the customer note and a primary quick sale that emits', async () => {
    const { fixture, el } = await render({
      note: 'Customer: Lina Haddad · billed to this project',
      quick: 'Quick sale',
    });
    const emitted: string[] = [];
    fixture.componentInstance.quickSale.subscribe(() => emitted.push('quick'));
    expect(el.querySelector('h2')?.textContent).toBe('Sell to this project');
    expect(el.querySelector('.note')?.textContent).toContain('Lina Haddad');
    const button = el.querySelector('button.md-btn--primary') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Quick sale');
    button.click();
    expect(emitted).toEqual(['quick']);
  });

  it('shows the notice with supply and add-customer actions that emit', async () => {
    const { fixture, el } = await render({
      notice: { title: 'No customer', message: 'Nothing to sell to.' },
      supply: 'Supply this project',
      addCustomer: 'Add customer',
    });
    const emitted: string[] = [];
    fixture.componentInstance.supplyProject.subscribe(() => emitted.push('supply'));
    fixture.componentInstance.addCustomerTo.subscribe(() => emitted.push('add'));
    expect(el.textContent).toContain('Nothing to sell to.');
    expect(el.querySelector('button.md-btn--primary')).toBeNull();
    const [supply, add] = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[];
    supply.click();
    add.click();
    expect(emitted).toEqual(['supply', 'add']);
  });

  it('shows no buttons when none are given', async () => {
    const { el } = await render({});
    expect(el.querySelector('button')).toBeNull();
  });
});
