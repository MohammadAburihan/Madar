import { realTranslator } from '../../../../testing/real-translator';
import { connectionFields } from './settings-view';

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
});
