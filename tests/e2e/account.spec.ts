import '../../scripts/env';
import { test, expect, type Page } from '@playwright/test';

// Real registration and password screens against the seeded database (M1-PH3-TC14 to TC17). Like the sign-in checks,
// they need the isolated or development stack with `npm run db:fixtures` applied and are enabled explicitly.
test.skip(process.env.PTL_E2E_AUTH !== '1', 'Set PTL_E2E_AUTH=1 with seeded synthetic accounts to run real account checks.');
const password = () => process.env.FIXTURE_PASSWORD!;
const NEW_PASSWORD = 'e2e-registered-secret-1';

async function signIn(page: Page, username: string, secret = password()) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('a visitor registers as a Seller, is not signed in, then signs in with the new account', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const username = 'e2e.' + Date.now().toString(36);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create an account', exact: true }).first().click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create a Seller account');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Display name', { exact: true }).fill('E2E Seller');
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?notice=registered$/);
  await expect(page.getByText('Your account is ready.', { exact: true })).toBeVisible();
  // Registration never signs anyone in.
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/seller\/parcels$/);
  expect(errors).toEqual([]);
});

test('registration reports a taken username on its field and keeps what was typed', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Username', { exact: true }).fill('seller.a');
  await page.getByLabel('Display name', { exact: true }).fill('Someone Else');
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('That username is taken. Try another.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('seller.a');
  await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page).toHaveURL(/\/register$/);
});

test('the register form works with the keyboard alone, with no overflow at 320px and in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/register');
  await page.getByLabel('Username', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Enter a username.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: '.local/test-results/register-320.png', fullPage: true });
});

test('a signed-in Seller changes the password from the account screen and is signed out everywhere', async ({ page, browser }) => {
  const username = 'e2e.' + Date.now().toString(36) + 'p';
  await page.goto('/register');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Display name', { exact: true }).fill('E2E Password');
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?notice=registered$/);
  await signIn(page, username, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/seller\/parcels$/);

  const other = await (await browser.newContext()).newPage();
  await signIn(other, username, NEW_PASSWORD);
  await expect(other).toHaveURL(/\/seller\/parcels$/);

  await page.getByRole('link', { name: 'Password', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Change your password');
  await page.getByLabel('Current password', { exact: true }).fill(NEW_PASSWORD + '-wrong');
  await page.getByLabel('New password', { exact: true }).fill('e2e-changed-secret-2');
  await page.getByLabel('Confirm new password', { exact: true }).fill('e2e-changed-secret-2');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByText('That is not your current password.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current password', { exact: true })).toBeFocused();

  await page.getByLabel('Current password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill('e2e-changed-secret-2');
  await page.getByLabel('Confirm new password', { exact: true }).fill('e2e-changed-secret-2');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?notice=password-changed$/);
  await expect(page.getByText('Your password was changed.', { exact: true })).toBeVisible();
  // Every session ended, including the one on the other device.
  await other.reload();
  await expect(other).toHaveURL(/\/login$/);
  await signIn(page, username, NEW_PASSWORD);
  await expect(page.getByText('Incorrect username or password.', { exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('e2e-changed-secret-2');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/seller\/parcels$/);
});

test('a must-change account sees why it is on the change screen, and a wrong current password changes nothing', async ({ page }) => {
  await signIn(page, 'must.change');
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByText(/An Admin set your current password/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to your workspace' })).toHaveCount(0);
  await page.getByLabel('Current password', { exact: true }).fill(password() + '-wrong');
  await page.getByLabel('New password', { exact: true }).fill('e2e-must-change-1');
  await page.getByLabel('Confirm new password', { exact: true }).fill('e2e-must-change-1');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByText('That is not your current password.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/password$/);
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: '.local/test-results/must-change-desktop.png', fullPage: true });
});

test('the change screen is not shown to a visitor who is not signed in', async ({ page }) => {
  await page.goto('/account/password');
  await expect(page).toHaveURL(/\/login$/);
});

test('a session the server ends is explained on the sign-in page, and the next sign-in shows no earlier data', async ({ page, context }) => {
  await signIn(page, 'seller.a');
  await expect(page).toHaveURL(/\/seller\/parcels$/);
  await page.getByRole('link', { name: 'Track a parcel', exact: true }).click();
  await expect(page).toHaveURL(/\/track$/);
  // The server no longer knows the session (as after an idle timeout or a password reset elsewhere).
  await context.clearCookies();
  await page.getByRole('link', { name: 'Your workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?notice=expired$/);
  await expect(page.getByText('Your session ended.', { exact: true })).toBeVisible();

  // A different person signs in on the same browser: nothing of the earlier account is left on screen or in storage.
  await signIn(page, 'admin');
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.locator('body')).not.toContainText('seller.a');
  const stored = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  expect(stored.session).toEqual([]);
  expect(stored.local.filter(key => key !== 'ptl_theme')).toEqual([]);
});
