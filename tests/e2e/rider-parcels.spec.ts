import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { required } from '../../scripts/env';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

test.skip(process.env.PTL_E2E_AUTH !== '1', 'Set PTL_E2E_AUTH=1 with the migrated Rider fixture profile.');

async function signIn(page: Page, username: string) {
  await page.goto('/login?workspace=rider');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(process.env.FIXTURE_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/rider/parcels');
  await expect(page.getByRole('list', { name: 'Assigned parcel records' })).toBeVisible();
}

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function seedBrowserRiderParcel() {
  const databaseUrl = required('FIXTURE_DATABASE_URL');
  const target = new URL(databaseUrl);
  if (process.env.PTL_PROFILE !== 'test' || target.port !== '54323'
    || target.pathname !== '/postgres' || target.username !== 'fixture_provisioner') {
    throw new Error('The Rider browser fixture requires the isolated local test database.');
  }
  const trackingNumber = 'PTL-' + randomBytes(16).toString('hex').toUpperCase();
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  try {
    await database.query('BEGIN');
    await database.query('SET LOCAL ROLE auth_fn_owner');
    const users = await database.query<{ id: string; username: string }>(`
      SELECT id, username FROM app.app_user WHERE username = ANY($1)
    `, [['seller.a', 'rider.a']]);
    const ids = Object.fromEntries(users.rows.map(user => [user.username, user.id]));
    if (!ids['seller.a'] || !ids['rider.a']) throw new Error('Synthetic Rider browser accounts are missing.');
    await database.query('SET LOCAL ROLE domain_writer');
    const parcel = await database.query<{ id: string }>(`
      INSERT INTO app.parcel (
        tracking_number, seller_id, assigned_rider_id, recipient_name, recipient_phone, recipient_address,
        weight_kg, current_status, version, client_request_id, creation_fingerprint, created_at
      ) VALUES ($1, $2, $3, 'Synthetic Recipient', '+60000000000', 'Fictional test address',
        1.250, 'ASSIGNED', 2, $4, repeat('a', 64), clock_timestamp()) RETURNING id
    `, [trackingNumber, ids['seller.a'], ids['rider.a'], randomUUID()]);
    await database.query(`
      INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at)
      VALUES ($1, $2, 'REGISTERED', clock_timestamp() - interval '1 second'),
             ($1, $3, 'ASSIGNED', clock_timestamp())
    `, [parcel.rows[0].id, ids['seller.a'], ids['rider.a']]);
    await database.query('COMMIT');
    return trackingNumber;
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  } finally {
    await database.end();
  }
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

test('M3-PH2-TC09 starts delivery with a real Rider login and isolates Rider B', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'TC09 is the required phone journey.');
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const trackingNumber = await seedBrowserRiderParcel();
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
