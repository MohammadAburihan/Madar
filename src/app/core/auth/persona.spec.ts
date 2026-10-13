import { OWN_SALES_ONLY, personaFor } from './persona';

describe('personaFor', () => {
  it('maps ERPNext roles to home personas', () => {
    expect(personaFor(['System Manager', 'Sales User'])).toBe('owner');
    expect(personaFor(['Accounts Manager'])).toBe('owner');
    expect(personaFor(['Sales User', 'Accounts User'])).toBe('salesperson');
    expect(personaFor(['Stock User'])).toBe('warehouse');
  });

  it('makes a user with both sales and stock roles a store associate', () => {
    expect(personaFor(['Sales User', 'Accounts User', 'Stock User'])).toBe('storeAssociate');
    expect(personaFor(['Sales Manager', 'Stock Manager'])).toBe('storeAssociate');
    expect(personaFor(['System Manager', 'Sales User', 'Stock User'])).toBe('owner');
  });

  it('limits both sales roles to their own sales', () => {
    expect(OWN_SALES_ONLY).toEqual(['salesperson', 'storeAssociate']);
  });
});
