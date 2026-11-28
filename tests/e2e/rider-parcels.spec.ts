import '../../scripts/env';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { fileFixtures } from '../fixtures/files/generate';

test.skip(process.env.PTL_E2E_AUTH !== '1', 'Set PTL_E2E_AUTH=1 with the migrated Rider fixture profile.');

async function signIn(page: Page, username: string, landing = '/rider/parcels') {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(process.env.FIXTURE_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === landing);
  if (landing === '/rider/parcels') {
    await expect(page.getByRole('list', { name: 'Assigned parcel records' })).toBeVisible();
  }
}

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function csrfToken(page: Page) {
  const response = await page.request.get('/api/v1/auth/csrf');
  expect(response.status()).toBe(200);
  return (await response.json() as { csrfToken: string }).csrfToken;
}

async function registerAndAssignBrowserParcel(page: Page) {
  await signIn(page, 'seller.a', '/seller/parcels');
  const sellerCsrf = await csrfToken(page);
  const registered = await page.request.post('/api/v1/parcels', {
    headers: { origin: new URL(page.url()).origin, 'x-csrf-token': sellerCsrf },
    data: {
      recipientName: 'Synthetic Recipient', recipientPhone: '+60000000000',
      recipientAddress: 'Fictional test address', weightKg: '1.250', clientRequestId: randomUUID(),
    },
  });
  expect(registered.status()).toBe(201);
  const parcel = await registered.json() as { id: string; trackingNumber: string; version: number };
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, 'admin', '/admin/dashboard');
  const adminCsrf = await csrfToken(page);
  const riders = await page.request.get('/api/v1/admin/users?role=RIDER&isActive=true&pageSize=100');
  expect(riders.status()).toBe(200);
  const directory = await riders.json() as { items: Array<{ id: string; username: string }> };
  const rider = directory.items.find(item => item.username === 'rider.a');
  expect(rider).toBeDefined();
  const assigned = await page.request.patch(`/api/v1/admin/parcels/${parcel.id}/assignment`, {
    headers: { origin: new URL(page.url()).origin, 'x-csrf-token': adminCsrf },
    data: { riderId: rider!.id, expectedVersion: parcel.version },
  });
  expect(assigned.status()).toBe(200);
  expect(await assigned.json()).toMatchObject({ id: parcel.id, currentStatus: 'ASSIGNED', version: parcel.version + 1 });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  return parcel.trackingNumber;
}

async function verifyThemes(page: Page, testInfo: TestInfo) {
  for (const theme of ['light', 'dark']) {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) await page.getByRole('button', { name: 'Switch to ' + theme + ' theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await fitsViewport(page);
    await page.screenshot({ path: testInfo.outputPath('rider-list-' + theme + '.png'), fullPage: true });
  }
}

test('TC08 Rider list preserves focus, both themes and phone reflow', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (testInfo.project.name === 'phone') await page.setViewportSize({ width: 320, height: 800 });
  await signIn(page, 'rider.a');
  await page.getByLabel('Status').focus();
  await expect(page.getByLabel('Status')).toBeFocused();
  expect(await page.getByLabel('Status').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await verifyThemes(page, testInfo);

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await fitsViewport(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  if (testInfo.project.name === 'phone') {
    await page.setViewportSize({ width: 800, height: 375 });
    await fitsViewport(page);
  }
});

test('M3-PH3-TC17 assigns through A15, starts delivery with a real Rider login and isolates Rider B', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'TC09 is the required phone journey.');
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const trackingNumber = await registerAndAssignBrowserParcel(page);
  await signIn(page, 'rider.a');

  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: trackingNumber }) });
  const detailPath = await row.getByRole('link').getAttribute('href');
  const started = page.waitForResponse(response =>
    response.url().endsWith('/status') && response.request().method() === 'POST');
  await row.getByRole('button', { name: /Start delivery/ }).click();
  expect((await started).status()).toBe(200);
  const updatedRow = page.getByRole('listitem').filter({ hasText: trackingNumber });
  await expect(updatedRow.getByText('Out for delivery', { exact: true })).toBeVisible();
  await expect(updatedRow.getByRole('button', { name: /Start delivery/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: trackingNumber })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: trackingNumber }).getByText('Out for delivery', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 'rider.b');
  await expect(page.getByText(trackingNumber, { exact: true })).toHaveCount(0);
  await page.goto(detailPath!);
  await expect(page.getByRole('heading', { name: 'Parcel not found' })).toBeVisible();
  await expect(page.getByText(trackingNumber, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('M3-PH3-TC14 Rider records Delivered with proof on a phone and rejects hostile selections locally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'The Rider outcome journey is verified at phone size.');
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  const statusRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/status')) statusRequests.push(request.url());
  });

  const trackingNumber = await registerAndAssignBrowserParcel(page);
  await signIn(page, 'rider.a');
  await page.getByRole('link', { name: trackingNumber }).click();
  await expect(page.getByRole('heading', { name: 'Start this delivery' })).toBeVisible();

  const started = page.waitForResponse(response => response.url().endsWith('/status') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start delivery' }).click();
  expect((await started).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Record the outcome' })).toBeVisible();

  const fixtures = await fileFixtures();
  const hostile = fixtures.find(fixture => fixture.id === 'double-extension')!;
  const oversized = fixtures.find(fixture => fixture.id === 'oversize')!;
  const valid = fixtures.find(fixture => fixture.id === 'valid-jpg')!;
  const input = page.getByLabel('Proof photo');
  await input.focus();
  await expect(input).toBeFocused();

  await input.setInputFiles({ name: hostile.filename, mimeType: 'image/jpeg', buffer: hostile.bytes });
  await expect(page.getByText(/double-extension files are not accepted/)).toBeVisible();
  expect(statusRequests).toHaveLength(1);
  await input.setInputFiles({ name: oversized.filename, mimeType: 'image/jpeg', buffer: oversized.bytes });
  await expect(page.getByText(/larger than 3 MiB/)).toBeVisible();
  expect(statusRequests).toHaveLength(1);

  await input.setInputFiles({ name: valid.filename, mimeType: 'image/jpeg', buffer: valid.bytes });
  await page.getByLabel('Delivered').check();
  await fitsViewport(page);
  for (const theme of ['light', 'dark']) {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) await page.getByRole('button', { name: 'Switch to ' + theme + ' theme' }).click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('article', { name: 'parcel docket ' + trackingNumber })).toContainText('Out for delivery');
    await fitsViewport(page);
    await page.screenshot({ path: testInfo.outputPath(`rider-outcome-${theme}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await fitsViewport(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await fitsViewport(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

  const delivered = page.waitForResponse(response => response.url().endsWith('/status') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save outcome' }).click();
  expect((await delivered).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Record the outcome' })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'parcel docket ' + trackingNumber })).toContainText('Delivered');
  expect(statusRequests).toHaveLength(2);
  expect(errors).toEqual([]);
});
