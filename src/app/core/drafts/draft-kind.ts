export type DraftKind = 'sale' | 'quotation' | 'order' | 'purchase' | 'payment';

export const DRAFT_DOCTYPE: Record<DraftKind, string> = {
  sale: 'Sales Invoice',
  quotation: 'Quotation',
  order: 'Sales Order',
  purchase: 'Purchase Order',
  payment: 'Payment Entry',
};
