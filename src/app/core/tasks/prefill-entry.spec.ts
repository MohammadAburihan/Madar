import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { realTranslator } from '../../../testing/real-translator';
import { ErpnextError } from '../erpnext/erpnext-error';
import { SessionService } from '../auth/session.service';
import {
  PrefillOpening,
  PrefillUnavailableError,
  injectPrefillEntry,
  prefillNoticeText,
} from './prefill-entry';
import { lineRate, mergeLines, validQty } from './prefill-lines';
import { TaskPrefillService } from './task-prefill.service';

const PAYLOAD = { customer: 'Lina Haddad', lines: [{ item_code: 'OLV-20', qty: 2 }] };

function setup(
  open: (payload: unknown, kind?: string) => Promise<PrefillOpening>,
  held: Record<string, unknown> = { 'PF-1': PAYLOAD },
  first: string | null = 'PF-1',
) {
  const query = new BehaviorSubject(convertToParamMap(first ? { prefill: first } : {}));
  const failed = vi.fn();
  const checkExpired = vi.fn();
  const peek = vi.fn((_kind: string, id: string) => held[id] ?? null);
  const drop = vi.fn();
  @Component({ template: '' })
  class Host {
    readonly entry = injectPrefillEntry('quotation', (p, k) => open(p, k), failed);
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: TaskPrefillService, useValue: { peek, drop } },
      { provide: SessionService, useValue: { checkExpired } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query },
      },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return {
    fixture,
    entry: fixture.componentInstance.entry,
    query,
    failed,
    peek,
    drop,
    checkExpired,
  };
}

describe('injectPrefillEntry', () => {
  it('is ready at once when the address names no proposal', () => {
    const open = vi.fn();
    const { entry, peek } = setup(open, {}, null);
    expect(entry.phase()).toBe('ready');
    expect(peek).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('loads the proposal before the task is shown, then is ready', async () => {
    const open = vi.fn().mockResolvedValue('opened');
    const { fixture, entry, failed, peek, drop } = setup(open);
    expect(entry.phase()).toBe('loading');
    await fixture.whenStable();
    expect(drop).toHaveBeenCalledWith('quotation', 'PF-1');
    expect(peek).toHaveBeenCalledWith('quotation', 'PF-1');
    expect(open).toHaveBeenCalledWith(PAYLOAD, 'quotation');
    expect(entry.phase()).toBe('ready');
    expect(failed).not.toHaveBeenCalled();
  });

  it('says the proposal expired when nothing is held under the id, and opens nothing', async () => {
    const open = vi.fn();
    const { fixture, entry, failed } = setup(open, {});
    await fixture.whenStable();
    expect(open).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith('expired');
    expect(entry.phase()).toBe('ready');
  });

  it('says it is unavailable when the task refuses it', async () => {
    const open = vi.fn().mockRejectedValue(new PrefillUnavailableError('customer'));
    const { fixture, entry, failed, checkExpired } = setup(open);
    await fixture.whenStable();
    expect(failed).toHaveBeenCalledWith('unavailable');
    expect(entry.phase()).toBe('ready');
    expect(checkExpired).not.toHaveBeenCalled();
  });

  it('checks whether the session ended when ERPNext refuses a read', async () => {
    const open = vi.fn().mockRejectedValue(new ErpnextError('forbidden', 'No permission', 403));
    const { fixture, failed, checkExpired } = setup(open);
    await fixture.whenStable();
    expect(checkExpired).toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith('unavailable');
  });

  it('tells a busy task its proposal was not opened and keeps the proposal', async () => {
    const open = vi.fn().mockResolvedValue('busy');
    const { fixture, entry, failed, drop } = setup(open);
    await fixture.whenStable();
    expect(entry.phase()).toBe('ready');
    expect(failed).toHaveBeenCalledWith('busy');
    expect(drop).not.toHaveBeenCalled();
  });

  it('takes each id once: stepping back to the same address keeps the user’s edits', async () => {
    const open = vi.fn().mockResolvedValue('opened');
    const { fixture, query, peek } = setup(open);
    await fixture.whenStable();
    query.next(convertToParamMap({}));
    query.next(convertToParamMap({ prefill: 'PF-1' }));
    await fixture.whenStable();
    expect(peek).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('opens a newer proposal on the same page', async () => {
    const open = vi.fn().mockResolvedValue('opened');
    const { fixture, query } = setup(open, { 'PF-1': PAYLOAD, 'PF-2': { ...PAYLOAD, lines: [] } });
    await fixture.whenStable();
    query.next(convertToParamMap({ prefill: 'PF-2' }));
    await fixture.whenStable();
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith({ ...PAYLOAD, lines: [] }, 'quotation');
  });
});

describe('prefillNoticeText', () => {
  it('says what was filled in and what to check, in English', () => {
    const tr = realTranslator('en');
    expect(prefillNoticeText(tr, 'filled', 'quick_sale')).toEqual({
      tone: 'tint',
      title: 'Filled in by the assistant',
      message: 'Check the items, prices and customer, then confirm.',
    });
    expect(prefillNoticeText(tr, 'filled', 'quotation').message).toBe(
      'Check the items, prices and customer, then confirm.',
    );
    expect(prefillNoticeText(tr, 'filled', 'purchase_order').message).toBe(
      'Check the items, prices and supplier, then confirm.',
    );
    expect(prefillNoticeText(tr, 'filled', 'collect_payment').message).toBe(
      'Check the customer, invoices and amount, then confirm.',
    );
    expect(prefillNoticeText(tr, 'filled', 'stock_move').message).toBe(
      'Check the item, locations and quantity, then confirm.',
    );
  });

  it('says what was filled in and what to check, in Arabic', () => {
    const tr = realTranslator('ar');
    expect(prefillNoticeText(tr, 'filled', 'quick_sale')).toEqual({
      tone: 'tint',
      title: 'عبّأه المساعد',
      message: 'راجع الأصناف والأسعار والعميل، ثم أكّد.',
    });
    expect(prefillNoticeText(tr, 'filled', 'purchase_order').message).toBe(
      'راجع الأصناف والأسعار والمورد، ثم أكّد.',
    );
    expect(prefillNoticeText(tr, 'filled', 'collect_payment').message).toBe(
      'راجع العميل والفواتير والمبلغ، ثم أكّد.',
    );
    expect(prefillNoticeText(tr, 'filled', 'stock_move').message).toBe(
      'راجع الصنف والمواقع والكمية، ثم أكّد.',
    );
  });

  it('warns when the proposal expired or can not be opened, in both languages', () => {
    expect(prefillNoticeText(realTranslator('en'), 'expired', 'quick_sale')).toEqual({
      tone: 'warning',
      title: 'This proposal has expired.',
      message: 'Ask the assistant again.',
    });
    expect(prefillNoticeText(realTranslator('ar'), 'expired', 'quick_sale')).toEqual({
      tone: 'warning',
      title: 'انتهت صلاحية هذا الاقتراح.',
      message: 'اطلب من المساعد مرة أخرى.',
    });
    expect(prefillNoticeText(realTranslator('en'), 'busy', 'quotation')).toEqual({
      tone: 'warning',
      title: 'Finish the current task first',
      message: "The assistant's proposal wasn't opened.",
    });
    expect(prefillNoticeText(realTranslator('ar'), 'busy', 'quotation')).toEqual({
      tone: 'warning',
      title: 'أنهِ المهمة الحالية أولاً',
      message: 'لم يُفتح اقتراح المساعد.',
    });
    expect(prefillNoticeText(realTranslator('en'), 'unavailable', 'quotation').tone).toBe(
      'warning',
    );
    expect(prefillNoticeText(realTranslator('ar'), 'unavailable', 'quotation').title).toBe(
      'تعذّر فتح هذا الاقتراح.',
    );
  });
});

describe('proposal lines', () => {
  it('adds up the quantities of an item named twice and keeps the first typed rate', () => {
    expect(
      mergeLines([
        { item_code: 'A', qty: 1, rate: 5 },
        { item_code: 'B', qty: 2 },
        { item_code: 'A', qty: 3, rate: 9 },
      ]),
    ).toEqual([
      { item_code: 'A', qty: 4, rate: 5 },
      { item_code: 'B', qty: 2 },
    ]);
  });

  it('uses a typed rate only where the role may set prices, and never a bad one', () => {
    expect(lineRate({ item_code: 'A', qty: 1, rate: 80 }, true, 85)).toBe(80);
    expect(lineRate({ item_code: 'A', qty: 1, rate: 0 }, true, 85)).toBe(0);
    expect(lineRate({ item_code: 'A', qty: 1, rate: 80 }, false, 85)).toBe(85);
    expect(lineRate({ item_code: 'A', qty: 1 }, true, 85)).toBe(85);
    expect(lineRate({ item_code: 'A', qty: 1, rate: -1 }, true, 85)).toBe(85);
    expect(lineRate({ item_code: 'A', qty: 1, rate: NaN }, true, 85)).toBe(85);
  });

  it('accepts quantities above 0 and up to 10000', () => {
    expect([0, -1, NaN, Infinity, 10001, 0.5, 1, 10000].map(validQty)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});
