import { personaFor } from './persona';

describe('personaFor', () => {
  it('maps ERPNext roles to home personas', () => {
    expect(personaFor(['System Manager', 'Sales User'])).toBe('owner');
    expect(personaFor(['Accounts Manager'])).toBe('owner');
    expect(personaFor(['Sales User', 'Accounts User'])).toBe('salesperson');
    expect(personaFor(['Stock User'])).toBe('warehouse');
    expect(personaFor(['Sales User', 'Stock User'])).toBe('salesperson');
  });
});
