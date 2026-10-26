import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createAuth, UpstreamError } from '../src/auth.js';
import { createNodeRequester, nodeRequester, type TransportOptions } from '../src/erpnext-http.js';

const SITE = 'rehannursery.aburehan.net';

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('node requester', () => {
  it('sends the site Host header so the bench finds the site', async () => {
    const hosts: string[] = [];
    const server = await listen((req, res) => {
      hosts.push(req.headers.host ?? '');
      const url = req.url ?? '';
      if (req.headers.host !== SITE) {
        res.writeHead(404).end('{}');
        return;
      }
      const message = url.includes('get_logged_user')
        ? 'a@b.c'
        : url.includes('doctype=Has+Role')
          ? [{ role: 'Sales User' }]
          : [{ name: 'Sales User' }];
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message }));
    });
    const auth = createAuth({ upstream: server.url, siteHost: SITE, request: nodeRequester });
    expect(await auth.userFor('sid=1')).toBe('a@b.c');
    expect(hosts).toEqual([SITE, SITE, SITE]);
    const wrong = createAuth({
      upstream: server.url,
      siteHost: 'other.test',
      request: nodeRequester,
    });
    expect(await wrong.userFor('sid=1')).toBeNull();
    await server.close();
  });

  it('rejects when the upstream is too slow', async () => {
    const server = await listen(() => {});
    await expect(nodeRequester(server.url, { headers: {}, timeoutMs: 50 })).rejects.toThrow(
      /timed out/,
    );
    await server.close();
  });

  it('maps a refused connection to UpstreamError', async () => {
    const server = await listen(() => {});
    await server.close();
    const auth = createAuth({ upstream: server.url, siteHost: SITE, request: nodeRequester });
    await expect(auth.userFor('sid=1')).rejects.toBeInstanceOf(UpstreamError);
  });

  it('uses https with the site host as SNI servername', async () => {
    const seen: { url: string; options: TransportOptions }[] = [];
    const requester = createNodeRequester({
      'https:': (url, options, onResponse) => {
        seen.push({ url, options });
        const req = new EventEmitter() as unknown as http.ClientRequest;
        req.end = (() => {
          const res = new EventEmitter() as http.IncomingMessage;
          res.statusCode = 200;
          onResponse(res);
          res.emit('data', Buffer.from('{"message":"ok"}'));
          res.emit('end');
          return req;
        }) as typeof req.end;
        return req;
      },
    });
    const response = await requester('https://erp.internal:8443/api/method/frappe.ping', {
      headers: { Host: SITE },
      timeoutMs: 1000,
    });
    expect(response).toEqual({ status: 200, body: '{"message":"ok"}' });
    expect(seen[0].options.servername).toBe(SITE);
    expect(seen[0].options.headers).toEqual({ Host: SITE });
  });
});
