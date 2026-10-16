import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NATIVE_ERPNEXT_URLS, NATIVE_PLATFORM } from '../platform/native-platform';
import { ConnectionService } from './connection.service';

function setup(platform: 'web' | 'android') {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NATIVE_PLATFORM, useValue: platform },
      { provide: NATIVE_ERPNEXT_URLS, useValue: {} },
      { provide: DOCUMENT, useValue: { location: { origin: 'https://rehan.example.com' } } },
    ],
  });
  return {
    connection: TestBed.inject(ConnectionService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('ConnectionService', () => {
  beforeEach(() => localStorage.clear());

  it('on the web, confirms this site’s own address and sends another business’s elsewhere', async () => {
    const { connection } = setup('web');
    expect(connection.connected()).toBe(false);
    expect(await connection.connect('padel.example.com')).toBe('elsewhere');
    expect(await connection.connect('rehan.example.com')).toBe('connected');
    expect(connection.connected()).toBe(true);
    expect(await connection.connect('not an address')).toBe('invalid');
  });

  it('in the apps, connects only to a Madar that answers, and forgets the previous business’s name', async () => {
    localStorage.setItem('madar.lastBusiness', 'Rehan Nursery');
    const { connection, http } = setup('android');
    expect(connection.connected()).toBe(false);
    const failing = connection.connect('https://padel.example.com');
    http.expectOne('https://padel.example.com/api/method/ping').flush(null, {
      status: 0,
      statusText: 'Unknown Error',
    });
    expect(await failing).toBe('unreachable');
    const connecting = connection.connect('padel.example.com');
    http.expectOne('https://padel.example.com/api/method/ping').flush({ message: 'pong' });
    expect(await connecting).toBe('connected');
    expect([connection.address(), localStorage.getItem('madar.lastBusiness')]).toEqual([
      'https://padel.example.com',
      null,
    ]);
  });
});
