import '../../scripts/env';
import { test, expect, type Page } from '@playwright/test';

// The Admin accounts screen against the seeded database (M1-PH3-TC15 and TC16). Like the other real-account checks, it
// needs the isolated or development stack with `npm run db:fixtures` applied. It only changes a Rider it creates itself.
test.skip(process.env.PTL_E2E_AUTH !== '1', 'Set PTL_E2E_AUTH=1 with seeded synthetic accounts to run real Admin checks.');
const password = () => process.env.FIXTURE_PASSWORD!;
const INITIAL = 'e2e-initial-secret-1';

async function signIn(page: Page, username: string, secret: string) {
  await page.goto('/login');
  // Wait for the page to hydrate so the form is handled by the app, not submitted natively.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const account = (page: Page, username: string) => page.getByRole('list', { name: 'Accounts' }).getByRole('listitem').filter({ hasText: username });

test('an Admin creates a Rider, resets the password, disables the account, and sees it in the activity list', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const username = 'e2e.r' + Date.now().toString(36);

  await signIn(page, 'admin', password());
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Accounts');
  // The list is newest first, so older fixture accounts are found through the filters.
  await page.getByLabel('Role', { exact: true }).selectOption('ADMIN');
  await expect(account(page, 'admin').getByText('You', { exact: true })).toBeVisible();
  await expect(account(page, 'admin').getByRole('button')).toHaveCount(0);
  await page.getByLabel('Role', { exact: true }).selectOption('');

  // Create a Rider.
  await page.getByRole('button', { name: 'Create Rider', exact: true }).click();
  const form = page.getByRole('form', { name: 'Create a Rider account' });
  await form.getByLabel('Username', { exact: true }).fill(username);
  await form.getByLabel('Display name', { exact: true }).fill('E2E Rider');
  await form.getByLabel('Initial password', { exact: true }).fill(INITIAL);
  await form.getByRole('button', { name: 'Create Rider', exact: true }).click();
  await expect(page.getByText(/Rider account created for E2E Rider/)).toBeVisible();
  await expect(account(page, username)).toBeVisible();
  await expect(account(page, username).getByText('Must change password')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(INITIAL);

  // The new Rider signs in and is held on the change screen.
  const riderPage = await (await browser.newContext()).newPage();
  await signIn(riderPage, username, INITIAL);
  await expect(riderPage).toHaveURL(/\/account\/password$/);

  // Reset: the Rider's session ends and the old password stops working; the temporary password is shown once.
  await account(page, username).getByRole('button', { name: /Reset password/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset password', exact: true }).click();
  const secret = page.getByRole('dialog', { name: 'Temporary password' });
  const temporary = (await secret.getByLabel('Temporary password').innerText()).trim();
  expect(temporary).toMatch(/^[A-Za-z0-9_-]{24}$/);
  await secret.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(temporary);
  await riderPage.reload();
  await expect(riderPage).toHaveURL(/\/login$/);
  await signIn(riderPage, username, INITIAL);
  await expect(riderPage.getByText('Incorrect username or password.', { exact: true })).toBeVisible();
  await signIn(riderPage, username, temporary);
  await expect(riderPage).toHaveURL(/\/account\/password$/);

  // Disable: the open Rider session fails on its next request, and the account shows as disabled.
  await account(page, username).getByRole('button', { name: /Disable/ }).click();
  await expect(page.getByRole('dialog').getByText(username, { exact: false })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Disable account', exact: true }).click();
  await expect(account(page, username).getByText('Disabled', { exact: true })).toBeVisible();
  await expect(account(page, username).getByRole('button', { name: /Reactivate/ })).toBeVisible();
  await riderPage.reload();
  await expect(riderPage).toHaveURL(/\/login$/);
  await signIn(riderPage, username, temporary);
  await expect(riderPage.getByText('Incorrect username or password.', { exact: true })).toBeVisible();

  // Reactivation lets the account sign in again.
  await account(page, username).getByRole('button', { name: /Reactivate/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivate account', exact: true }).click();
  await expect(account(page, username).getByText('Disabled', { exact: true })).toHaveCount(0);
  await signIn(riderPage, username, temporary);
  await expect(riderPage).toHaveURL(/\/account\/password$/);

  // The activity panel lists what happened, newest first.
  await page.getByRole('button', { name: 'Show activity', exact: true }).click();
  const activity = page.getByRole('list', { name: 'Recent activity' });
  await expect(activity.getByText('Account created').first()).toBeVisible();
  await expect(activity.getByText('Password reset by an Admin').first()).toBeVisible();
  await expect(activity.getByText('Account enabled or disabled').first()).toBeVisible();
  await page.getByLabel('Event type', { exact: true }).selectOption('USER_CREATED');
  await expect(activity.getByText('Password reset by an Admin')).toHaveCount(0);
  await expect(activity.getByText('Account created').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Admin accounts screen has no overflow at 320px in dark mode and stays operable by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, 'admin', password());
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.goto('/admin/users');
  await expect(page.getByRole('list', { name: 'Accounts' }).getByRole('listitem').first()).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.getByRole('button', { name: 'Create Rider', exact: true }).focus();
  await page.keyboard.press('Enter');
  const form = page.getByRole('form', { name: 'Create a Rider account' });
  await expect(form).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await page.screenshot({ path: '.local/test-results/admin-users-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Show activity', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Recent activity' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
});

test('a Seller opening the Admin accounts screen is told it is not theirs and no account list loads', async ({ page }) => {
  await signIn(page, 'seller.a', password());
  await expect(page).toHaveURL(/\/seller\/parcels$/);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/v1/admin/')) requests.push(request.url()); });
  await page.goto('/admin/users');
  await expect(page.getByText('This workspace is for Admin accounts.', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});
