import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { ViewportService } from '../../../core/layout/viewport.service';
import { ContactBankApiService } from '../data-access/contact-bank-api.service';
import { ContactsApiService } from '../data-access/contacts-api.service';
import { ContactContainer } from './contact.container';

const IBAN = 'JO94CBJO0010000000000131000302';
const DETAIL = {
  id: 'Nour',
  name: 'Nour',
  phone: null,
  email: null,
  address: [],
  active: true,
  totals: null,
  latest: null,
  recent: [],
};
const plain = (el: Element | null | undefined) =>
  el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function open(persona: Persona, account: () => Promise<unknown>, roles?: string[]) {
  TestBed.resetTestingModule();
  const bank = { account: vi.fn(account) };
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: ContactsApiService, useValue: { customer: vi.fn().mockResolvedValue(DETAIL) } },
      { provide: ContactBankApiService, useValue: bank },
      {
        provide: SessionService,
        useValue: {
          user: signal({ id: 'rehan@rehan.example' }),
          persona: () => persona,
          capabilities: () => capabilitiesFor(persona, roles),
          checkExpired: vi.fn(),
        },
      },
      {
        provide: BusinessService,
        useValue: {
          active: signal({ name: 'Rehan Nursery', currency: 'ILS' }),
          ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }),
        },
      },
      { provide: ViewportService, useValue: { viewport: signal('mobile') } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(ContactContainer);
  fixture.componentRef.setInput('kind', 'customers');
  fixture.componentRef.setInput('id', 'Nour');
  await fixture.whenStable();
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement, bank };
}

describe('ContactContainer bank details', () => {
  const account = {
    name: 'a',
    bank: 'Arab Bank',
    iban: IBAN,
    accountNo: '123-456',
    modified: 'm',
    disabled: false,
  };

  it('shows the bank, IBAN and account number to the owner', async () => {
    const { root } = await open('owner', () => Promise.resolve(account));
    const card = root.querySelector('app-bank-details-card');
    expect(plain(card)).toContain('Bank details');
    expect(plain(card)).toContain('Arab Bank');
    expect(plain(card)).toContain(IBAN);
    expect(plain(card)).toContain('123-456');
  });

  it('shows nothing for a disabled account', async () => {
    const { root } = await open('owner', () => Promise.resolve({ ...account, disabled: true }));
    expect(root.querySelector('app-bank-details-card')).toBeNull();
  });

  it('does not read the account for a role without the capability', async () => {
    const { root, bank } = await open('salesperson', () => Promise.resolve(account), [
      'Sales User',
      'Accounts User',
    ]);
    expect(bank.account).not.toHaveBeenCalled();
    expect(root.querySelector('app-bank-details-card')).toBeNull();
  });

  it('hides the block on a forbidden read but says so on any other failure', async () => {
    const forbidden = await open('owner', () =>
      Promise.reject(new ErpnextError('forbidden', 'no', 403, null)),
    );
    expect(forbidden.root.querySelector('app-bank-details-card')).toBeNull();
    expect(plain(forbidden.root)).not.toContain("couldn't be loaded");
    const failed = await open('owner', () =>
      Promise.reject(new HttpErrorResponse({ status: 500 })),
    );
    expect(plain(failed.root)).toContain("Bank details couldn't be loaded");
  });
});
