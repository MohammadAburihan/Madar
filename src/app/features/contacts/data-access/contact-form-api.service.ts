import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ContactFormValue, ContactKind } from './contacts.models';

interface PartyDoc {
  name: string;
  mobile_no?: string | null;
  email_id?: string | null;
  [key: string]: unknown;
}

interface ContactDoc {
  name: string;
  phone_nos: { phone: string; is_primary_mobile_no?: number; is_primary_phone?: number }[];
  email_ids: { email_id: string; is_primary?: number }[];
  [key: string]: unknown;
}

interface AddressDoc {
  name: string;
  address_line1: string;
  city?: string | null;
  [key: string]: unknown;
}

const PARTY = {
  customers: {
    doctype: 'Customer',
    name: 'customer_name',
    details: 'customer_details',
    prefix: 'customer',
  },
  suppliers: {
    doctype: 'Supplier',
    name: 'supplier_name',
    details: 'supplier_details',
    prefix: 'supplier',
  },
} as const;

/** Adding customers and suppliers, and editing how to reach them (their primary contact and address). */
@Injectable({ providedIn: 'root' })
export class ContactFormApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** The form's values for an existing contact; the address is its primary address's first line. */
  async load(kind: ContactKind, id: string): Promise<ContactFormValue> {
    const party = PARTY[kind];
    const doc = await firstValueFrom(this.erpnext.doc<PartyDoc>(party.doctype, id));
    const addressName = doc[`${party.prefix}_primary_address`] as string | null | undefined;
    const address = addressName
      ? await firstValueFrom(this.erpnext.doc<AddressDoc>('Address', addressName))
      : null;
    return {
      name: String(doc[party.name] ?? doc.name),
      phone: doc.mobile_no ?? '',
      email: doc.email_id ?? '',
      address: address?.address_line1 ?? '',
    };
  }

  /**
   * Creates the contact, or updates `existing`. A create runs through confirmRequest: a lost answer throws
   * UnresolvedError, and `find()` tells whether it was made. Resolves to the contact's id.
   */
  async save(
    kind: ContactKind,
    value: ContactFormValue,
    existing: string | null,
    reference: string,
    country: string,
  ): Promise<string> {
    if (existing) {
      await this.update(kind, existing, value, country);
      return existing;
    }
    const party = PARTY[kind];
    const name = value.name.trim();
    const address = value.address.trim();
    // ERPNext makes the primary contact and address from these quick-entry fields.
    const doc = await confirmRequest(
      this.erpnext.post<{ name: string }>('frappe.client.insert', {
        doc: {
          doctype: party.doctype,
          [party.name]: name,
          ...(kind === 'customers' ? { customer_type: 'Individual' } : {}),
          ...(value.phone.trim() ? { mobile_no: value.phone.trim() } : {}),
          ...(value.email.trim() ? { email_id: value.email.trim() } : {}),
          ...(address ? { address_line1: address, city: address, country } : {}),
          [party.details]: `Madar contact ${reference}`,
        },
      }),
    );
    return doc.name;
  }

  /** The contact a create with this Madar reference made, if any. */
  async find(kind: ContactKind, reference: string): Promise<string | null> {
    const party = PARTY[kind];
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string }>(party.doctype, {
        fields: ['name'],
        filters: [[party.details, 'like', `%${reference}%`]],
        limit: 1,
      }),
    );
    return row?.name ?? null;
  }

  /** Writes the name onto the party and phone, email and address onto its primary contact and address. */
  private async update(
    kind: ContactKind,
    id: string,
    value: ContactFormValue,
    country: string,
  ): Promise<void> {
    const party = PARTY[kind];
    const doc = await firstValueFrom(this.erpnext.doc<PartyDoc>(party.doctype, id));
    const link = [{ link_doctype: party.doctype, link_name: id }];
    const phone = value.phone.trim();
    const email = value.email.trim();
    const address = value.address.trim();
    let contactName = doc[`${party.prefix}_primary_contact`] as string | null | undefined;
    if (contactName) {
      const contact = await firstValueFrom(this.erpnext.doc<ContactDoc>('Contact', contactName));
      await firstValueFrom(
        this.erpnext.post('frappe.client.save', {
          doc: {
            ...contact,
            phone_nos: primaryFirst(contact.phone_nos, phone, (r) => !!r.is_primary_mobile_no, {
              phone,
              is_primary_mobile_no: 1,
            }),
            email_ids: primaryFirst(contact.email_ids, email, (r) => !!r.is_primary, {
              email_id: email,
              is_primary: 1,
            }),
          },
        }),
      );
    } else if (phone || email) {
      const created = await firstValueFrom(
        this.erpnext.post<{ name: string }>('frappe.client.insert', {
          doc: {
            doctype: 'Contact',
            first_name: value.name.trim(),
            phone_nos: phone ? [{ phone, is_primary_mobile_no: 1 }] : [],
            email_ids: email ? [{ email_id: email, is_primary: 1 }] : [],
            links: link,
          },
        }),
      );
      contactName = created.name;
      // Made primary at once, so a retry after a failed party save edits it instead of adding another.
      await this.makePrimary(party.doctype, id, `${party.prefix}_primary_contact`, contactName);
    }
    let addressName = doc[`${party.prefix}_primary_address`] as string | null | undefined;
    if (addressName && !address) {
      // Cleared: the party no longer shows an address; the Address record itself stays for past documents.
      addressName = null;
    } else if (addressName) {
      const current = await firstValueFrom(this.erpnext.doc<AddressDoc>('Address', addressName));
      if (address !== current.address_line1) {
        await firstValueFrom(
          this.erpnext.post('frappe.client.save', {
            doc: { ...current, address_line1: address, city: current.city || address },
          }),
        );
      }
    } else if (address) {
      const created = await firstValueFrom(
        this.erpnext.post<{ name: string }>('frappe.client.insert', {
          doc: {
            doctype: 'Address',
            address_title: value.name.trim(),
            address_type: 'Billing',
            address_line1: address,
            city: address,
            country,
            links: link,
          },
        }),
      );
      addressName = created.name;
      await this.makePrimary(party.doctype, id, `${party.prefix}_primary_address`, addressName);
    }
    // Saving a contact can touch its party, so the party is read again before its own save.
    const latest = await firstValueFrom(this.erpnext.doc<PartyDoc>(party.doctype, id));
    // Saving the party also refreshes the phone, email and address it shows from them.
    await firstValueFrom(
      this.erpnext.post('frappe.client.save', {
        doc: {
          ...latest,
          [party.name]: value.name.trim(),
          [`${party.prefix}_primary_contact`]: contactName ?? null,
          [`${party.prefix}_primary_address`]: addressName ?? null,
          // ERPNext keeps the shown address text when the link goes; it must go with it.
          ...(addressName ? {} : { primary_address: '' }),
        },
      }),
    );
  }

  private async makePrimary(doctype: string, id: string, field: string, value: string) {
    await firstValueFrom(
      this.erpnext.post('frappe.client.set_value', { doctype, name: id, fieldname: field, value }),
    );
  }
}

/** The rows with the primary one set to `value` (added when missing, dropped when cleared), others kept. */
function primaryFirst<T extends object>(
  rows: T[],
  value: string,
  isPrimary: (row: T) => boolean,
  fresh: T,
): T[] {
  const others = rows.filter((r) => !isPrimary(r));
  const primary = rows.find(isPrimary);
  if (!value) {
    return others;
  }
  return [primary ? { ...primary, ...fresh } : fresh, ...others];
}
