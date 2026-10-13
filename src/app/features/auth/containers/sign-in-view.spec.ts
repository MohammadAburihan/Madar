import { realTranslator } from '../../../../testing/real-translator';
import { buildSignInView, NoticeKey } from './sign-in-view';

const plain = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, ''));

describe('buildSignInView', () => {
  const build = (notice: NoticeKey | null, knownBusiness: string | null = 'Rehan Nursery') =>
    plain(
      buildSignInView(
        { knownBusiness, host: 'erp.example.com', notice, forgotEmail: 'lina@rehan.example' },
        realTranslator('en'),
      ),
    );

  it('names the remembered business, or falls back to the host', () => {
    expect(build(null).labels.subtitle).toBe('Sign in to Rehan Nursery.');
    expect(build(null, null)).toMatchObject({
      businessName: 'erp.example.com',
      labels: { subtitle: 'Sign in to your business.', footer: 'Connected to erp.example.com' },
    });
  });

  it('maps each notice to its tone and wording', () => {
    const notices = (
      [
        'invalid',
        'noSession',
        'offline',
        'error',
        'expired',
        'forgotMissing',
        'forgotSent',
        'missing',
      ] as const
    ).map((key) => [key, build(key).notice.tone, build(key).notice.title]);
    expect(notices).toEqual([
      ['invalid', 'danger', 'Email or password is incorrect'],
      ['noSession', 'danger', "Signed in, but the session wasn't kept"],
      ['offline', 'warning', 'Connection unavailable'],
      ['error', 'danger', "Couldn't sign in"],
      ['expired', 'warning', 'Session expired'],
      ['forgotMissing', 'warning', 'Enter your email first'],
      ['forgotSent', 'tint', 'Check your email'],
      ['missing', 'danger', 'Enter your email and password'],
    ]);
    expect(build('forgotSent').notice.message).toContain('lina@rehan.example');
    expect(build(null).notice).toBeNull();
  });
});
