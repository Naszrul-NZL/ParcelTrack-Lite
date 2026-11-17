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

for (const [username, landing, heading] of [['seller.a', '/seller/parcels', 'Seller workspace'], ['rider.a', '/rider/parcels', 'Rider workspace'], ['admin', '/admin/dashboard', 'Admin workspace']]) {
  test(`${username} signs in, survives a refresh, signs out and cannot go back to private content`, async ({ page, context, request }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await signIn(page, username);
    await expect(page).toHaveURL(new RegExp(landing + '$'));
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Signed in as');
    const session = (await context.cookies()).find(cookie => cookie.name === 'ptl_session_dev')!;
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Signed in as');
    // Leave the workspace through a normal navigation so Back has a private page to return to after sign-out.
    await page.getByRole('link', { name: 'Track a parcel', exact: true }).click();
    await expect(page).toHaveURL(/\/track$/);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
    await expect(page.getByText('Signed in as')).toHaveCount(0);
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
