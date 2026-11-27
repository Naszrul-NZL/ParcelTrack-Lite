import '../../scripts/env';
import { test, expect, type Page } from '@playwright/test';

// Real sign-in against the seeded database (M1-PH2-TC15). It needs the isolated or development stack with
// `npm run db:fixtures` applied, so it only runs when explicitly enabled; the CI smoke job enables it.
test.skip(process.env.PTL_E2E_AUTH !== '1', 'Set PTL_E2E_AUTH=1 with seeded synthetic accounts to run real sign-in checks.');
const password = () => process.env.FIXTURE_PASSWORD!;

async function signIn(page: Page, username: string, secret = password()) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

for (const [username, landing, heading] of [['seller.a', '/seller/parcels', 'Your parcels'], ['rider.a', '/rider/parcels', 'Assigned parcels'], ['admin', '/admin/dashboard', 'Admin workspace']]) {
  test(`${username} signs in, survives a refresh, signs out and cannot go back to private content`, async ({ page, context, request }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await signIn(page, username);
    await expect(page).toHaveURL(new RegExp(landing + '$'));
    await expect(page.locator('#main').getByText(heading, { exact: true })).toBeVisible();
    await expect(page.locator('#main').getByText('Signed in as')).toBeVisible();
    const session = (await context.cookies()).find(cookie => cookie.name === 'ptl_session_dev')!;
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    await page.reload();
    await expect(page.locator('#main').getByText('Signed in as')).toBeVisible();
    // Leave the workspace through a normal navigation so Back has a private page to return to after sign-out.
    await page.getByRole('link', { name: 'Track a parcel', exact: true }).click();
    await expect(page).toHaveURL(/\/track$/);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
    await expect(page.locator('#main').getByText('Signed in as')).toHaveCount(0);
    await page.goto(landing);
    await expect(page).toHaveURL(/\/login$/);
    const stale = await request.get('/api/v1/auth/me', { headers: { cookie: `${session.name}=${session.value}` } });
    expect(stale.status()).toBe(401);
    expect(errors).toEqual([]);
  });
}

test('a wrong password shows one generic message and keeps the person on sign in', async ({ page }) => {
  await signIn(page, 'seller.a', password() + '-wrong');
  await expect(page.getByText('Incorrect username or password.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page).toHaveURL(/\/login$/);
});

test('a Seller opening the Admin workspace is told it is not theirs', async ({ page }) => {
  await signIn(page, 'seller.a');
  await expect(page).toHaveURL(/\/seller\/parcels$/);
  await page.goto('/admin/dashboard');
  await expect(page.getByText('This workspace is for Admin accounts.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your workspace', exact: true })).toHaveAttribute('href', '/seller/parcels');
});

test('an account that must change its password is held on a notice', async ({ page }) => {
  await signIn(page, 'must.change');
  await expect(page.getByText('Change your password before you continue.', { exact: true })).toBeVisible();
});

test('sign-in works with the keyboard alone on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).focus();
  await page.keyboard.type('seller.a');
  await page.keyboard.press('Tab');
  await page.keyboard.type(password());
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/seller\/parcels$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a delayed anonymous session check cannot undo a successful login', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/me', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(401);
    await held;
    await route.fulfill({ response });
  }, { times: 1 });
  try {
    await signIn(page, 'seller.a');
    await expect(page).toHaveURL(/\/seller\/parcels$/);
    const sessionCheck = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/me') && response.status() === 401);
    release();
    await sessionCheck;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('#main').getByText('Signed in as')).toBeVisible();
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
    const logout = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/logout'));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    expect((await logout).status()).toBe(204);
    await expect(page).toHaveURL(/\/login$/);
  } finally { release(); }
});

test('sign-out recovers on the next click after another tab rotates the session', async ({ page, context }) => {
  await signIn(page, 'seller.a');
  await expect(page).toHaveURL(/\/seller\/parcels$/);
  const other = await context.newPage();
  await other.goto('/seller/parcels');
  await other.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(other).toHaveURL(/\/login$/);
  await signIn(other, 'seller.a');
  await expect(other).toHaveURL(/\/seller\/parcels$/);

  const logouts: number[] = [];
  page.on('response', response => {
    if (response.url().endsWith('/api/v1/auth/logout')) logouts.push(response.status());
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Couldn’t sign out. Try again.', { exact: true })).toBeVisible();
  expect(logouts).toEqual([403]);
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(logouts).toEqual([403, 204]);
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
});

for (const action of ['signs out', 'switches accounts'] as const) {
  test(`session loading fails closed if another tab ${action} between identity and CSRF reads`, async ({ page, context }) => {
    await signIn(page, 'seller.a');
    await expect(page).toHaveURL(/\/seller\/parcels$/);
    const other = await context.newPage();
    await other.goto('/seller/parcels');
    await expect(other.locator('#main').getByText('Signed in as')).toBeVisible();

    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let captured!: () => void;
    const ready = new Promise<void>(resolve => { captured = resolve; });
    await page.route('**/api/v1/auth/me', async route => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      captured();
      await held;
      await route.fulfill({ response });
    }, { times: 1 });
    try {
      await page.reload();
      await ready;
      await other.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(other).toHaveURL(/\/login$/);
      if (action === 'switches accounts') {
        await signIn(other, 'seller.b');
        await expect(other).toHaveURL(/\/seller\/parcels$/);
      }
      release();
      if (action === 'signs out') {
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
        expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
      } else {
        await expect(page.getByText('We couldn’t check your session.', { exact: true })).toBeVisible();
        const me = await page.request.get('/api/v1/auth/me');
        expect(me.status()).toBe(200);
        expect((await me.json()).username).toBe('seller.b');
        await page.getByRole('button', { name: 'Reload page' }).click();
        await expect(page.locator('#main').getByText('Signed in as seller.b.', { exact: true })).toBeVisible();
      }
      await expect(page.locator('#main').getByText('Signed in as seller.a.', { exact: true })).toHaveCount(0);
    } finally { release(); }
  });
}
