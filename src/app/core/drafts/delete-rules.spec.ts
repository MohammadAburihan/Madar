import { capabilitiesFor } from '../auth/capabilities';
import { mayDeleteDraft } from './delete-rules';

describe('mayDeleteDraft', () => {
  it('lets the owner delete any draft, whoever made it', () => {
    const caps = capabilitiesFor('owner');
    for (const kind of ['sale', 'quotation', 'order', 'purchase', 'payment'] as const) {
      expect(mayDeleteDraft(kind, caps, 'owner', false)).toBe(true);
    }
  });

  it('lets salespeople and store associates delete only their own sales drafts', () => {
    for (const persona of ['salesperson', 'storeAssociate'] as const) {
      const caps = capabilitiesFor(persona);
      for (const kind of ['sale', 'quotation', 'order'] as const) {
        expect([
          mayDeleteDraft(kind, caps, persona, true),
          mayDeleteDraft(kind, caps, persona, false),
        ]).toEqual([true, false]);
      }
      expect(mayDeleteDraft('purchase', caps, persona, true)).toBe(false);
      expect(mayDeleteDraft('payment', caps, persona, true)).toBe(false);
    }
  });

  it('lets a purchasing officer delete purchase drafts and supplier payments, not sales ones', () => {
    const caps = capabilitiesFor('purchasing');
    expect([
      mayDeleteDraft('purchase', caps, 'purchasing', false),
      mayDeleteDraft('payment', caps, 'purchasing', false),
      mayDeleteDraft('sale', caps, 'purchasing', true),
    ]).toEqual([true, caps.paySuppliers, false]);
  });

  it('gives roles that make nothing no delete', () => {
    const caps = capabilitiesFor('warehouse');
    for (const kind of ['sale', 'quotation', 'order', 'purchase', 'payment'] as const) {
      expect(mayDeleteDraft(kind, caps, 'warehouse', true)).toBe(false);
    }
  });
});
