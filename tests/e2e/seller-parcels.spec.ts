import '../../scripts/env';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

test.skip(process.env.PTL_E2E_AUTH !== '1', 'Set PTL_E2E_AUTH=1 with the migrated and seeded test stack.');

async function signIn(page: Page, username: string, landing = '/seller/parcels') {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(process.env.FIXTURE_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === landing);
}

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function verifyThemes(page: Page, testInfo: TestInfo, screen: string) {
  for (const theme of ['light', 'dark']) {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) await page.getByRole('button', { name: 'Switch to ' + theme + ' theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await fitsViewport(page);
    await page.screenshot({ path: testInfo.outputPath(screen + '-' + theme + '.png'), fullPage: true });
  }
}

test('M2-PH2-TC14 registers a parcel, preserves it on refresh, and hides it from the other Seller', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'phone') await page.setViewportSize({ width: 320, height: 800 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const recipient = '<script>synthetic parcel note</script>';
  await signIn(page, 'seller.a');
  await expect(page.getByRole('list', { name: 'Parcel records' })).toBeVisible();
  await verifyThemes(page, testInfo, 'seller-list');
  await page.getByRole('link', { name: 'New parcel' }).click();
  await expect(page.getByRole('heading', { name: 'Register a parcel' })).toBeVisible();
  await verifyThemes(page, testInfo, 'registration');
  await page.getByLabel('Recipient name').fill(recipient);
  await page.getByLabel('Recipient phone').fill('012-3456789');
  await page.getByLabel('Delivery address').fill('Synthetic address for test');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Weight (kg)')).toBeFocused();
  expect(await page.getByLabel('Weight (kg)').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Enter a weight from/)).toBeVisible();
  await page.getByLabel('Weight (kg)').fill('1.25');
  const registered = page.waitForResponse(response =>
    response.url().endsWith('/api/v1/parcels') && response.request().method() === 'POST');
  await page.keyboard.press('Enter');
  const response = await registered;
  expect(response.status()).toBe(201);
  const parcel = await response.json() as { id: string; trackingNumber: string };
  await expect(page.getByRole('heading', { name: 'Parcel registered' })).toBeFocused();
  await expect(page.getByRole('heading', { name: parcel.trackingNumber })).toBeVisible();
  await fitsViewport(page);
  await page.getByRole('link', { name: 'View parcel details' }).click();
  await expect(page.getByText(recipient, { exact: true })).toBeVisible();

  await verifyThemes(page, testInfo, 'parcel-detail');

  await page.reload();
  await expect(page.getByRole('heading', { name: parcel.trackingNumber })).toBeVisible();
  await page.getByRole('link', { name: 'Your parcels', exact: true }).last().click();
  await expect(page.getByRole('link', { name: new RegExp(parcel.trackingNumber) })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 'seller.b');
  await expect(page.getByText('Signed in as seller.b.', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Parcel records' })).toBeVisible();
  await expect(page.getByText(parcel.trackingNumber, { exact: true })).toHaveCount(0);
  await page.goto('/parcels/' + parcel.id);
  await expect(page.getByRole('heading', { name: 'Parcel not found' })).toBeVisible();
  await expect(page.getByText(recipient, { exact: true })).toHaveCount(0);
  for (const [username, landing] of [['rider.a', '/rider/parcels'], ['admin', '/admin/dashboard']]) {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, username, landing);
    const csrf = await page.request.get('/api/v1/auth/csrf');
    expect(csrf.status()).toBe(200);
    const denied = await page.request.post('/api/v1/parcels', {
      headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': (await csrf.json()).csrfToken },
      data: {
        recipientName: 'Synthetic Recipient', recipientPhone: '0123456789', recipientAddress: 'Synthetic address',
        weightKg: '1.25', clientRequestId: globalThis.crypto.randomUUID(),
      },
    });
    expect(denied.status()).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  }
  expect(errors).toEqual([]);
});

test('M2-PH3-TC11 searches by recipient fragment and tracking prefix, filters by status, and isolates Seller B', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'phone') await page.setViewportSize({ width: 320, height: 800 });
  // A unique, wildcard-bearing name proves the search is literal: `%` and `_` match only themselves.
  const marker = 'Srch' + Date.now().toString(36) + testInfo.project.name;
  const recipient = `Literal ${marker} 100%_done`;
  await signIn(page, 'seller.a');
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json() as { csrfToken: string }).csrfToken;
  const created = await page.request.post('/api/v1/parcels', {
    headers: { origin: new URL(page.url()).origin, 'x-csrf-token': csrf },
    data: { recipientName: recipient, recipientPhone: '0123456789', recipientAddress: 'Synthetic search address', weightKg: '2.000', clientRequestId: crypto.randomUUID() },
  });
  expect(created.status()).toBe(201);
  const parcel = await created.json() as { id: string; trackingNumber: string };
  await page.reload();

  const search = page.getByLabel('Search', { exact: true });
  const record = page.getByRole('link', { name: new RegExp(parcel.trackingNumber) });
  await search.fill(marker.toLowerCase() + ' 100%_');
  await expect(record).toBeVisible();
  await expect(page.getByRole('list', { name: 'Parcel records' }).getByRole('listitem')).toHaveCount(1);
  await search.fill(marker + ' 100x_');
  await expect(page.getByRole('heading', { name: 'No parcels match' })).toBeVisible();
  expect(page.url()).not.toContain(marker);

  await search.fill(parcel.trackingNumber.slice(0, 14).toLowerCase());
  await expect(record).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('DELIVERED');
  await expect(page.getByRole('heading', { name: 'No parcels match' })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('REGISTERED');
  await expect(record).toBeVisible();
  await fitsViewport(page);
  await record.click();
  await expect(page.getByText(recipient, { exact: true })).toBeVisible();
  // A Seller never gets the Rider or proof slots.
  await expect(page.getByRole('heading', { name: 'Delivery actions' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Delivery proof' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, 'seller.b');
  await page.getByLabel('Search', { exact: true }).fill(marker);
  await expect(page.getByRole('heading', { name: 'No parcels match' })).toBeVisible();
});
