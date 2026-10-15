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

  it('makes a user with a purchasing role a purchasing officer, even with stock and accounts roles', () => {
    expect(personaFor(['Purchase User', 'Stock User', 'Accounts User'])).toBe('purchasing');
    expect(personaFor(['Purchase Manager'])).toBe('purchasing');
    expect(personaFor(['System Manager', 'Purchase User'])).toBe('owner');
  });

  it('limits both sales roles to their own sales', () => {
    expect(OWN_SALES_ONLY).toEqual(['salesperson', 'storeAssociate']);
  });

  it('maps projects roles without a sales role to the project manager', () => {
    expect(personaFor(['Projects User', 'Stock User'])).toBe('projectManager');
    expect(personaFor(['Projects User', 'Sales User', 'Stock User'])).toBe('storeAssociate');
    expect(personaFor(['Projects Manager', 'System Manager'])).toBe('owner');
  });
});
