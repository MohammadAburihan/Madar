import { Translator } from '../../../core/i18n/translator';

/** The read-only facts of the connection, as on the connection settings mock. */
export function connectionFields(
  input: {
    business: string;
    address: string;
    currency: string;
    currencyName: string | null;
  },
  tr: Translator,
): { label: string; value: string }[] {
  const t = (key: string) => tr.t(`settings.${key}`);
  return [
    { label: t('businessName'), value: input.business },
    { label: t('address'), value: input.address },
    {
      label: t('currency'),
      // Some sites name a currency by its code: "ILS · ILS" would say nothing more.
      value:
        input.currencyName && input.currencyName !== input.currency
          ? `${input.currency} · ${input.currencyName}`
          : input.currency,
    },
  ];
}
