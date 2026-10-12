import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';

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
});
