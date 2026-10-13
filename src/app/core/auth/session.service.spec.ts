import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionNotKeptError, SessionService } from './session.service';

const LOGGED_USER = '/api/method/frappe.auth.get_logged_user';
const GET_DOC = '/api/method/frappe.client.get';
const GET_LIST = '/api/method/frappe.client.get_list';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { session: TestBed.inject(SessionService), http: TestBed.inject(HttpTestingController) };
}

const flushNext = async (http: HttpTestingController, url: string, body: object, status = 200) => {
  // match() removes what it returns, so capture the request inside the wait.
  let request: TestRequest | undefined;
  await vi.waitFor(() => {
    request ??= http.match((r) => r.url === url)[0];
    expect(request).toBeDefined();
  });
  request!.flush(body, { status, statusText: status === 200 ? 'OK' : 'Error' });
};

describe('SessionService', () => {
  it('signs in and loads the name and roles of the user', async () => {
    const { session, http } = setup();

    const signingIn = session.signIn('lina@rehan.example', 'secret');
    const login = http.expectOne('/api/method/login');
    expect(login.request.body).toEqual({ usr: 'lina@rehan.example', pwd: 'secret' });
    login.flush({ message: 'Logged In' });
    await flushNext(http, LOGGED_USER, { message: 'lina@rehan.example' });
    await flushNext(http, GET_DOC, {
      message: {
        name: 'lina@rehan.example',
        full_name: 'Lina Saleh',
        first_name: 'Lina',
        roles: [],
      },
    });
    await flushNext(http, GET_LIST, {
      message: [{ role: 'Sales User' }, { role: 'Accounts User' }],
    });
    await signingIn;

    expect(session.status()).toBe('signed-in');
    expect(session.user()).toEqual({
      id: 'lina@rehan.example',
      fullName: 'Lina Saleh',
      firstName: 'Lina',
      roles: ['Sales User', 'Accounts User'],
    });
    expect(session.persona()).toBe('salesperson');
  });

  it('treats a guest session as signed out and remembers it', async () => {
    const { session, http } = setup();

    const first = session.ensure();
    await flushNext(http, LOGGED_USER, { message: 'Not permitted' }, 403);

    expect(await first).toBe(false);
    expect(session.status()).toBe('signed-out');
    expect(await session.ensure()).toBe(false);
    http.expectNone(LOGGED_USER);
  });

  it('treats the 403 Frappe returns for guests as an expired session', async () => {
    const { session, http } = setup();

    const checking = session.checkExpired();
    await flushNext(http, LOGGED_USER, { exc_type: 'PermissionError' }, 403);

    expect(await checking).toBe(true);
    expect(session.status()).toBe('expired');
  });

  it('detects an expired session after a permission error', async () => {
    const { session, http } = setup();

    const checking = session.checkExpired();
    await flushNext(http, LOGGED_USER, { message: 'Guest' });

    expect(await checking).toBe(true);
    expect(session.status()).toBe('expired');
  });

  it('does not sign the user out when ERPNext answers with a server error', async () => {
    const { session, http } = setup();

    const restoring = session.ensure();
    await flushNext(http, LOGGED_USER, { exc_type: 'Error' }, 502);

    await expect(restoring).rejects.toMatchObject({ kind: 'server' });
    expect(session.status()).toBe('unknown');
  });

  it('asks for the logged-in user only once while restoring', async () => {
    const { session, http } = setup();

    const restoring = session.ensure();
    await flushNext(http, LOGGED_USER, { message: 'lina@rehan.example' });
    await flushNext(http, GET_DOC, {
      message: { name: 'lina@rehan.example', full_name: 'Lina Saleh', first_name: 'Lina' },
    });
    await flushNext(http, GET_LIST, { message: [{ role: 'Sales User' }] });

    expect(await restoring).toBe(true);
    http.expectNone(LOGGED_USER);
  });

  it('reports connection failures when requesting a password reset, but not unknown accounts', async () => {
    const { session, http } = setup();
    const RESET = '/api/method/frappe.core.doctype.user.user.reset_password';

    const unknownAccount = session.requestPasswordReset('nobody@rehan.example');
    // ERPNext answers 200 with a neutral message for unknown accounts.
    await flushNext(http, RESET, { message: null });
    await expect(unknownAccount).resolves.toBeUndefined();

    const offline = session.requestPasswordReset('lina@rehan.example');
    let request: TestRequest | undefined;
    await vi.waitFor(() => {
      request ??= http.match((r) => r.url === RESET)[0];
      expect(request).toBeDefined();
    });
    request!.error(new ProgressEvent('error'), { status: 0 });
    await expect(offline).rejects.toMatchObject({ kind: 'offline' });
  });

  it('reports a session cookie that was not kept, rather than a wrong password', async () => {
    const { session, http } = setup();

    const signingIn = session.signIn('lina@rehan.example', 'secret');
    http.expectOne('/api/method/login').flush({ message: 'Logged In' });
    await flushNext(http, LOGGED_USER, { exc_type: 'PermissionError' }, 403);

    await expect(signingIn).rejects.toBeInstanceOf(SessionNotKeptError);
  });
});
