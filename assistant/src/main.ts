import Anthropic from '@anthropic-ai/sdk';
import { createAuth } from './auth.js';
import { nodeRequester } from './erpnext-http.js';
import { loadConfig } from './config.js';
import { createLimits } from './limits.js';
import { createApp } from './server.js';

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(`madar-assistant: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const app = createApp({
  config,
  client: new Anthropic({ apiKey: config.apiKey }),
  auth: createAuth({
    upstream: config.erpnextUpstream,
    siteHost: config.erpnextSiteHost,
    request: nodeRequester,
  }),
  limits: createLimits(config),
});

app.listen(config.port, () =>
  console.log(`madar-assistant listening on :${config.port} (${config.model})`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => app.close(() => process.exit(0)));
