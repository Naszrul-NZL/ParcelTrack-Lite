import '../../scripts/env';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

test.skip(process.env.PTL_E2E_AUTH !== '1', 'Set PTL_E2E_AUTH=1 with the migrated and seeded test stack.');

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

async function csrfToken(page: Page) {
  const response = await page.request.get('/api/v1/auth/csrf');
  expect(response.status()).toBe(200);
  return (await response.json() as { csrfToken: string }).csrfToken;
}

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('M3-PH3-TC12 Admin dashboard filters parcels and assigns through the real dialog', async ({ page }, testInfo: TestInfo) => {
  if (testInfo.project.name === 'phone') await page.setViewportSize({ width: 320, height: 800 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await signIn(page, 'seller.a', '/seller/parcels');
  await page.goto('/admin/dashboard');
  await expect(page.getByText('This workspace is for Admin accounts.')).toBeVisible();
  const sellerCsrf = await csrfToken(page);
  const registered = await page.request.post('/api/v1/parcels', {
    headers: { origin: new URL(page.url()).origin, 'x-csrf-token': sellerCsrf },
    data: {
      recipientName: 'Synthetic Admin UI Recipient', recipientPhone: '+60000000000',
      recipientAddress: 'Fictional Admin UI test address', weightKg: '1.250', clientRequestId: randomUUID(),
    },
  });
  expect(registered.status()).toBe(201);
  const parcel = await registered.json() as { trackingNumber: string };
  await signOut(page);

  await signIn(page, 'admin', '/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Parcel dashboard' })).toBeVisible();
  await expect(page.getByText(/Counts generated/)).toBeVisible();
  await fitsViewport(page);
  for (const theme of ['light', 'dark']) {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) await page.getByRole('button', { name: 'Switch to ' + theme + ' theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await fitsViewport(page);
    await page.screenshot({ path: testInfo.outputPath(`admin-dashboard-${theme}.png`), fullPage: true });
  }

  await page.getByRole('link', { name: 'Registered' }).click();
  await expect(page).toHaveURL(url => url.pathname === '/admin/parcels' && url.searchParams.get('status') === 'REGISTERED');
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('REGISTERED');
  const row = page.getByRole('listitem').filter({ hasText: parcel.trackingNumber });
  await expect(row).toBeVisible();

  const assignButton = row.getByRole('button', { name: /Assign Rider/ });
  await assignButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Active Rider')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('admin-assignment-dialog.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(assignButton).toBeFocused();

  await assignButton.click();
  await dialog.getByLabel('Active Rider').selectOption({ label: 'rider.a' });
  const assigned = page.waitForResponse(response => response.url().includes('/assignment') && response.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save assignment' }).click();
  expect((await assigned).status()).toBe(200);
  await expect(page.getByText(new RegExp('Rider assignment saved.*' + parcel.trackingNumber))).toBeVisible();
  await expect(row).toHaveCount(0);

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('link', { name: 'Assigned' }).click();
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('ASSIGNED');
  const assignedRow = page.getByRole('listitem').filter({ hasText: parcel.trackingNumber });
  await expect(assignedRow).toContainText('rider.a');
  await expect(assignedRow.getByRole('button', { name: /Reassign Rider/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-parcels-assigned.png'), fullPage: true });

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await fitsViewport(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  expect(errors).toEqual([]);
});
