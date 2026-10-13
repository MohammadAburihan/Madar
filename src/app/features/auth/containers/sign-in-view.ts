import { Translator } from '../../../core/i18n/translator';
import { SignInLabels, SignInMessage } from '../components/sign-in-form.component';

export type NoticeKey =
  | 'missing'
  | 'invalid'
  | 'noSession'
  | 'offline'
  | 'error'
  | 'expired'
  | 'forgotMissing'
  | 'forgotSent';

export interface SignInViewInput {
  /** Business remembered from the last sign-in on this device, if any. */
  knownBusiness: string | null;
  host: string;
  notice: NoticeKey | null;
  forgotEmail: string;
}

export interface SignInView {
  brand: string;
  businessName: string;
  labels: SignInLabels;
  notice: SignInMessage | null;
}

export function buildSignInView(input: SignInViewInput, tr: Translator): SignInView {
  const { t } = tr;
  const businessName = input.knownBusiness ?? input.host;
  return {
    brand: t('app.name'),
    businessName,
    labels: {
      title: t('signIn.title'),
      subtitle: input.knownBusiness
        ? t('signIn.subtitle', { business: input.knownBusiness })
        : t('signIn.subtitleNoBusiness'),
      email: t('signIn.email'),
      password: t('signIn.password'),
      submit: t('signIn.submit'),
      submitting: t('signIn.submitting'),
      forgot: t('signIn.forgot'),
      footer: t('signIn.connectedTo', { host: input.host }),
    },
    notice: input.notice ? notice(input.notice, businessName, input.forgotEmail, tr) : null,
  };
}

function notice(key: NoticeKey, business: string, email: string, { t }: Translator): SignInMessage {
  switch (key) {
    case 'offline':
      return {
        tone: 'warning',
        title: t('state.offline.title'),
        message: t('state.offline.message'),
      };
    case 'error':
      return { tone: 'danger', title: t('signIn.error.title'), message: t('signIn.error.message') };
    case 'expired':
      return {
        tone: 'warning',
        title: t('state.expired.title'),
        message: t('state.expired.message', { business }),
      };
    case 'forgotSent':
      return {
        tone: 'tint',
        title: t('signIn.forgotSent.title'),
        message: t('signIn.forgotSent.message', { email }),
      };
    case 'forgotMissing':
      return {
        tone: 'warning',
        title: t('signIn.forgotMissing.title'),
        message: t('signIn.forgotMissing.message'),
      };
    default:
      return {
        tone: 'danger',
        title: t(`signIn.${key}.title`),
        message: t(`signIn.${key}.message`),
      };
  }
}
