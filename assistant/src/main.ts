import Anthropic from '@anthropic-ai/sdk';
import { createAuth } from './auth.js';
import { nodeRequester } from './erpnext-http.js';
import { loadConfig } from './config.js';
import { createLimits } from './limits.js';
import { createSelfCheck } from './self-check.js';
import { createApp } from './server.js';

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(`madar-assistant: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const client = new Anthropic({ apiKey: config.apiKey });
const selfCheck = createSelfCheck({ client, model: config.model });

const app = createApp({
  config,
  client,
  selfCheck: config.selfCheck ? selfCheck : undefined,
  auth: createAuth({
    upstream: config.erpnextUpstream,
    siteHost: config.erpnextSiteHost,
    request: nodeRequester,
  }),
  limits: createLimits(config),
});

app.listen(config.port, () => {
  console.log(`madar-assistant listening on :${config.port} (${config.model})`);
  if (config.selfCheck) selfCheck.start();
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    selfCheck.stop();
    app.close(() => process.exit(0));
  });
