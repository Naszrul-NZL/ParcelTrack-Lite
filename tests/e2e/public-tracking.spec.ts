import '../../scripts/env';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// M2-PH3-TC09 against the real stack: Seller registers, Admin assigns, and an anonymous visitor tracks the parcel at each
// stage. Needs the seeded accounts (`npm run db:fixtures`), so it runs only with PTL_E2E_AUTH=1 like the other journeys.
test.skip(process.env.PTL_E2E_AUTH !== '1', 'Set PTL_E2E_AUTH=1 with seeded synthetic accounts to run real tracking checks.');

const RECIPIENT = { recipientName: 'Tracking Privacy Recipient', recipientPhone: '+60111222333', recipientAddress: 'Fictional Tracking Lane 42' };

async function signIn(page: Page, username: string, landing: string) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(process.env.FIXTURE_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === landing);
}
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}
async function csrf(page: Page) {
  return (await (await page.request.get('/api/v1/auth/csrf')).json() as { csrfToken: string }).csrfToken;
}

/** Tracks `number` in a fresh, signed-out browser context and checks what reached the DOM, network, URL and storage. */
async function trackAnonymously(page: Page, number: string, status: string) {
  const context = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  const visitor = await context.newPage();
  const sent: { method: string; url: string; headers: Record<string, string>; body: string | null }[] = [];
  const answers: string[] = [];
  visitor.on('request', request => { if (request.url().includes('/api/')) sent.push({ method: request.method(), url: request.url(), headers: request.headers(), body: request.postData() }); });
  visitor.on('response', async response => { if (response.url().endsWith('/api/v1/public/tracking')) answers.push(await response.text()); });
  await visitor.goto('/track');
  await visitor.getByLabel('Tracking number', { exact: true }).fill(number.toLowerCase());
  await visitor.getByRole('button', { name: 'Track parcel', exact: true }).click();
  await expect(visitor.getByRole('heading', { name: number, exact: true })).toBeVisible();
  await expect(visitor.locator('.tracking-status h2')).toHaveText(status);
  await expect(visitor.locator('.docket-journey [aria-current="step"] h3')).toHaveText(status);

  // The only write is the public lookup: no CSRF bootstrap or session is needed. It carries no cookie, token or referrer.
  // (The shell's own GET /auth/me identity check is unrelated to tracking.)
  const posts = sent.filter(item => item.method !== 'GET');
  expect(posts.map(item => item.method + ' ' + new URL(item.url).pathname)).toEqual(['POST /api/v1/public/tracking']);
  expect(sent.some(item => item.url.endsWith('/auth/csrf'))).toBe(false);
  sent.splice(0, sent.length, ...posts);
  expect(sent[0].headers.cookie).toBeUndefined();
  expect(sent[0].headers['x-csrf-token']).toBeUndefined();
  expect(sent[0].headers.referer ?? '').toBe('');
  expect(JSON.parse(sent[0].body!)).toEqual({ trackingNumber: number });
  const answer = JSON.parse(answers[0]);
  expect(Object.keys(answer)).toEqual(['history']);
  for (const item of answer.history) expect(Object.keys(item).sort()).toEqual(['changedAt', 'status']);

  // No private data in the response or the page; the number is not in the URL or browser storage.
  const pageText = await visitor.locator('body').innerText();
  for (const secret of Object.values(RECIPIENT)) {
    expect(answers[0]).not.toContain(secret);
    expect(pageText).not.toContain(secret);
  }
  // The tracking area (status, form and docket) names no account or proof. The shell's static copy is outside it.
  const resultText = await visitor.locator('.tracking-layout').innerText();
  expect(resultText).not.toMatch(/seller\.a|rider\.a|\bRider A\b|\bSeller A\b/);
  expect(resultText).not.toMatch(/proof/i);
  expect(visitor.url()).not.toContain(number);
  expect(await visitor.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await visitor.evaluate(() => document.cookie)).toBe('');
  await context.close();
}

test('M2-PH3-TC09 public tracking shows only status and time at each stage, by POST, with nothing stored', async ({ page }) => {
  await signIn(page, 'seller.a', '/seller/parcels');
  const registered = await page.request.post('/api/v1/parcels', {
    headers: { origin: new URL(page.url()).origin, 'x-csrf-token': await csrf(page) },
    data: { ...RECIPIENT, weightKg: '0.750', clientRequestId: randomUUID() },
  });
  expect(registered.status()).toBe(201);
  const parcel = await registered.json() as { id: string; trackingNumber: string; version: number };
  await signOut(page);
  await trackAnonymously(page, parcel.trackingNumber, 'Registered');

  await signIn(page, 'admin', '/admin/dashboard');
  const riders = await (await page.request.get('/api/v1/admin/users?role=RIDER&isActive=true&pageSize=100')).json() as { items: { id: string; username: string }[] };
  const assigned = await page.request.patch(`/api/v1/admin/parcels/${parcel.id}/assignment`, {
    headers: { origin: new URL(page.url()).origin, 'x-csrf-token': await csrf(page) },
    data: { riderId: riders.items.find(item => item.username === 'rider.a')!.id, expectedVersion: parcel.version },
  });
  expect(assigned.status()).toBe(200);
  await signOut(page);
  await trackAnonymously(page, parcel.trackingNumber, 'Assigned');
});

test('M2-PH3-TC09 an unknown number shows the not-found message and the phone layout does not overflow', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'phone') await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/track');
  await page.getByLabel('Tracking number', { exact: true }).fill('PTL-' + 'F'.repeat(32));
  await page.getByRole('button', { name: 'Track parcel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t find that parcel.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
