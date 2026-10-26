import { realTranslator } from '../../../../testing/real-translator';
import { connectionFields, deskRow } from './settings-view';

describe('settings view', () => {
  it('lists the connection facts as on the connection settings mock', () => {
    const input = {
      business: 'Rehan Nursery',
      address: 'https://rehan.example.com',
      currency: 'ILS',
      currencyName: 'Israeli New Shekel',
    };
    expect(connectionFields(input, realTranslator('en'))).toEqual([
      { label: 'Business name', value: 'Rehan Nursery' },
      { label: 'Workspace address', value: 'https://rehan.example.com' },
      { label: 'Currency', value: 'ILS · Israeli New Shekel' },
    ]);
    expect(connectionFields({ ...input, currencyName: null }, realTranslator('ar'))[2]).toEqual({
      label: 'العملة',
      value: 'ILS',
    });
    expect(connectionFields({ ...input, currencyName: 'ILS' }, realTranslator('en'))[2].value).toBe(
      'ILS',
    );
  });

  it('offers Open ERPNext to the owner when a Desk address is set', () => {
    const input = { deskUrl: 'https://desk.example.com', persona: 'owner' as const };
    expect(deskRow(input, realTranslator('en'))).toEqual({
      label: 'Open ERPNext',
      hint: "Desk, ERPNext's full screens",
      ariaLabel: 'Open ERPNext, opens in a new tab',
    });
    expect(deskRow(input, realTranslator('ar'))?.label).toBe('فتح ERPNext');
    expect(deskRow(input, realTranslator('ar'))?.ariaLabel).toContain('يفتح في تبويب جديد');
  });

  it('hides Open ERPNext without an address or for anyone but the owner', () => {
    expect(deskRow({ deskUrl: '', persona: 'owner' }, realTranslator('en'))).toBeNull();
    for (const persona of ['salesperson', 'storeAssociate', 'purchasing'] as const) {
      expect(
        deskRow({ deskUrl: 'https://desk.example.com', persona }, realTranslator('en')),
      ).toBeNull();
    }
  });
});
