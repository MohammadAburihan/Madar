import { chromium } from '@playwright/test';
const port = process.argv[2] || '4200';
const b = await chromium.launch();
const p = await b.newPage();
p.on('response', async (r) => { if (r.url().includes('/api/') && r.status() >= 400) console.log('FAIL', r.status(), r.request().method(), r.url().slice(0,120), (await r.text().catch(()=>'')).slice(0,300)); });
await p.goto(`http://localhost:${port}/`); await p.waitForTimeout(2000);
console.log('url', p.url());
if (p.url().includes('/connect')) { await p.getByLabel(/Workspace address/).fill(`localhost:${port}`); await p.getByRole('button', { name: 'Connect business' }).click(); await p.waitForTimeout(1500); console.log('after connect', p.url()); }
await p.getByLabel(/Email/).fill('rehan@rehan.example'); await p.getByLabel(/Password/).fill('Madar-Dev-2026');
await p.getByRole('button', { name: /^Sign in$/ }).click(); await p.waitForTimeout(3000); console.log('signed', p.url());
await p.goto(`http://localhost:${port}/settings`); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Sign out' }).click(); await p.waitForTimeout(3000); console.log('after signout', p.url());
console.log((await p.locator('body').innerText()).slice(0,400));
await b.close();
