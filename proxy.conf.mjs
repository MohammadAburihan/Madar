// ERPNEXT_DEV_URL=http://localhost:18081 targets the seeded test site from scripts/dev-test-site.sh.
const target = process.env.ERPNEXT_DEV_URL ?? 'http://localhost:18080';

export default {
  '/api': { target, changeOrigin: true },
  '/files': { target, changeOrigin: true },
  '/private/files': { target, changeOrigin: true },
};
