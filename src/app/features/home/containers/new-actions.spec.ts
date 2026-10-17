import { capabilitiesFor } from '../../../core/auth/capabilities';
import { realTranslator } from '../../../../testing/real-translator';
import { newActions } from './new-actions';

describe('new actions', () => {
  it('offers the owner everything, as on the New action menu', () => {
    expect(newActions(capabilitiesFor('owner'), realTranslator('en')).map((a) => a.label)).toEqual([
      'Quick sale',
      'Create quotation',
      'Buy from supplier',
      'Receive payment',
      'Pay supplier',
      'Receive goods',
      'Record expense',
      'Transfer stock',
      'Supply a project',
      'New project',
      'Add contact',
    ]);
  });

  it('offers each role only what it may start, each to its own task', () => {
    const ids = (persona: Parameters<typeof capabilitiesFor>[0]) =>
      newActions(capabilitiesFor(persona), realTranslator('en')).map((a) => a.id);
    expect(ids('warehouse')).toEqual(['receiveGoods', 'transferStock', 'supplyProject']);
    expect(ids('salesperson')).toEqual(['sell', 'quote', 'receivePayment', 'addContact']);
    const [sell] = newActions(capabilitiesFor('owner'), realTranslator('ar'));
    expect(sell).toEqual({ id: 'sell', label: 'بيع سريع', route: ['/sales/new'] });
  });
});
