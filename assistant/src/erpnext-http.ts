import http from 'node:http';
import https from 'node:https';

export interface ErpRequest {
  headers: Record<string, string>;
  timeoutMs: number;
}

export interface ErpResponse {
  status: number;
  body: string;
}

export type ErpRequester = (url: string, request: ErpRequest) => Promise<ErpResponse>;

export interface TransportOptions extends http.RequestOptions {
  servername?: string;
}

export type Transport = (
  url: string,
  options: TransportOptions,
  onResponse: (res: http.IncomingMessage) => void,
) => http.ClientRequest;

const transports: Record<string, Transport> = {
  'http:': (url, options, onResponse) => http.request(url, options, onResponse),
  'https:': (url, options, onResponse) => https.request(url, options, onResponse),
};

// fetch (undici) silently drops a custom Host header, and the bench picks the site by Host.
export function createNodeRequester(
  overrides: Partial<Record<string, Transport>> = {},
): ErpRequester {
  return (url, { headers, timeoutMs }) =>
    new Promise((resolve, reject) => {
      const { protocol } = new URL(url);
      const transport = overrides[protocol] ?? transports[protocol];
      if (!transport) {
        reject(new Error(`Unsupported ERPNext protocol ${protocol}`));
        return;
      }
      const host = headers['Host']?.replace(/:\d+$/, '');
      const req = transport(
        url,
        {
          method: 'GET',
          headers,
          timeout: timeoutMs,
          ...(protocol === 'https:' && host ? { servername: host } : {}),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
          );
        },
      );
      req.on('timeout', () => req.destroy(new Error('ERPNext request timed out')));
      req.on('error', reject);
      req.end();
    });
}

export const nodeRequester = createNodeRequester();
