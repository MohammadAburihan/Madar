// ERPNEXT_DEV_URL=http://localhost:18081 targets the seeded test site from scripts/dev-test-site.sh.
const target = process.env.ERPNEXT_DEV_URL ?? 'http://localhost:18080';

// ASSISTANT_DEV_URL=http://localhost:<port> reaches a locally running assistant service; without it /assistant lands on ERPNext, which answers 404.
export default {
  '/assistant/': { target: process.env.ASSISTANT_DEV_URL ?? target, changeOrigin: true },
  '/api': { target, changeOrigin: true },
  '/files': { target, changeOrigin: true },
  '/private/files': { target, changeOrigin: true },
};
