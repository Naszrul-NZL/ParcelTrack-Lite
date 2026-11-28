import { test, expect } from '@playwright/test';

test('tracking covers empty, local validation, lookup outcomes and sample journeys', async ({ page }) => {
  // No database is needed: A13 is answered by the test. Sample journeys never send a lookup.
  const lookups: { body: string | null; cookie?: string; csrf?: string }[] = [];
  const answers = [
    { status: 404, json: { error: { code: 'NOT_FOUND', message: 'The request could not be completed.' }, requestId: 'r1' } },
    { status: 200, json: { history: [{ status: 'REGISTERED', changedAt: '2026-10-21T08:00:00.000Z' }, { status: 'OUT_FOR_DELIVERY', changedAt: '2026-10-21T16:00:00.000Z' }] } },
  ];
  await page.route('**/api/v1/public/tracking', async route => {
    const headers = route.request().headers();
    lookups.push({ body: route.request().postData(), cookie: headers.cookie, csrf: headers['x-csrf-token'] });
    const answer = answers.shift()!;
    await route.fulfill({ status: answer.status, contentType: 'application/json', json: answer.json });
  });
  const number = 'PTL-' + 'ABCDEF0123456789'.repeat(2);
  await page.goto('/track');
  await expect(page.getByRole('heading', { name: 'Your parcel’s story starts here.' })).toBeVisible();
  await page.getByRole('button', { name: 'Track parcel', exact: true }).click();
  await expect(page.getByText('Enter a tracking number to continue.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Tracking number', { exact: true })).toBeFocused();
  await page.getByLabel('Tracking number', { exact: true }).fill('UNKNOWN');
  await page.getByRole('button', { name: 'Track parcel', exact: true }).click();
  await expect(page.getByText(/PTL- followed by 32 letters A to F or digits/)).toBeVisible();
  expect(lookups).toEqual([]);

  await page.getByLabel('Tracking number', { exact: true }).fill(number.toLowerCase());
  await page.getByRole('button', { name: 'Track parcel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t find that parcel.' })).toBeVisible();
  await page.getByRole('button', { name: 'Track parcel', exact: true }).click();
  await expect(page.getByRole('heading', { name: number, exact: true })).toBeVisible();
  await expect(page.locator('.tracking-status h2')).toHaveText('Out for delivery');
  await expect(page.getByRole('region', { name: 'Tracking result' })).toBeFocused();
  expect(lookups).toEqual([{ body: JSON.stringify({ trackingNumber: number }), cookie: undefined, csrf: undefined }, { body: JSON.stringify({ trackingNumber: number }), cookie: undefined, csrf: undefined }]);
  expect(page.url()).not.toContain(number);

  for (const [sample, status] of [['PTL-DEMO-002', 'Delivered'], ['PTL-DEMO-003', 'Registered'], ['PTL-DEMO-001', 'Out for delivery'], ['PTL-DEMO-004', 'Failed'], ['PTL-DEMO-005', 'Assigned']]) {
    await page.getByRole('button', { name: `${sample} ${status}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: sample, exact: true })).toBeVisible();
    await expect(page.locator('.tracking-status h2')).toHaveText(status);
    await expect(page.locator('.docket-journey [aria-current="step"] h3')).toHaveText(status);
    if (status === 'Failed') await expect(page.getByRole('region', { name: 'Tracking result' }).getByText('Delivered', { exact: true })).toHaveCount(0);
  }
  expect(lookups).toHaveLength(2);
});

test('sign-in validates locally, reports server outcomes and clears the password after each submit', async ({ page }) => {
  // No database is needed here: the auth API is answered by the test so every outcome is deterministic.
  const sent: { method: string; path: string; body: string | null }[] = [];
  const errors: string[] = [];
  const logins: { status: number; headers: Record<string, string>; body: unknown }[] = [
    { status: 401, headers: {}, body: { error: { code: 'AUTH_INVALID', message: 'x' }, requestId: 'r' } },
    { status: 429, headers: { 'Retry-After': '900' }, body: { error: { code: 'RATE_LIMITED', message: 'x' }, requestId: 'r' } },
  ];
  await page.route('**/api/v1/auth/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    sent.push({ method: request.method(), path, body: request.postData() });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'x' }, requestId: 'r' } });
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'test-csrf' } });
    const next = logins.shift()!;
    await new Promise(resolve => setTimeout(resolve, 150));
    return route.fulfill({ status: next.status, headers: next.headers, json: next.body });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login?workspace=rider');
  await expect(page.getByRole('radio', { name: 'Rider', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Rider', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Admin', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Admin', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Rider', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Admin', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Keep the handoffs moving.' })).toBeVisible();
  await page.getByRole('radio', { name: 'Seller', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Give every parcel a clear beginning.' })).toBeVisible();
  await page.getByRole('radio', { name: 'Rider', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Your next delivery, clearly laid out.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter your username.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
  await page.getByLabel('Username', { exact: true }).fill('sample.seller');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter your password.', { exact: true })).toBeVisible();
  expect(sent.filter(request => request.method === 'POST')).toEqual([]);
  await page.getByLabel('Password', { exact: true }).fill('sample-password-only');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeDisabled();
  await expect(page.getByText('Incorrect username or password.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('sample.seller');
  await page.getByLabel('Password', { exact: true }).fill('another-sample-password');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Too many sign-in attempts.', { exact: true })).toBeVisible();
  await expect(page.getByText('Try again in 15 minutes.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  const posts = sent.filter(request => request.method === 'POST');
  expect(posts.map(request => request.path)).toEqual(['/api/v1/auth/login', '/api/v1/auth/login']);
  expect(JSON.parse(posts[0].body!)).toEqual({ username: 'sample.seller', password: 'sample-password-only' });
  expect(page.url()).not.toContain('password');
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.getByRole('link', { name: 'Track without signing in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Track a parcel');
  expect(errors).toEqual([]);
});

test('home links, keyboard navigation and page layouts work across screen widths', async ({ page }, testInfo) => {
  const originalViewport = page.viewportSize()!;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [name, destination] of [['Try a sample parcel', '/track?number=PTL-DEMO-001'], ['View history', '/track?number=PTL-DEMO-001'], ['Explore seller sign in', '/login?workspace=seller'], ['Explore rider sign in', '/login?workspace=rider']]) {
    await page.goto('/');
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(destination.replace(/[?]/g, '\\?') + '$'));
  }
  await page.goto('/');
  await page.locator('.hero-actions').getByRole('link', { name: 'Track a parcel', exact: true }).click();
  await page.getByRole('button', { name: 'PTL-DEMO-002 Delivered', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PTL-DEMO-002', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('.public-tracking-note').getByRole('link', { name: 'Track a parcel' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Track a parcel');
  for (const route of ['/', '/track', '/login']) {
    await page.setViewportSize(originalViewport);
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).locator('[aria-current="page"]')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(route === '/' ? 'home.png' : route.slice(1) + '.png'), fullPage: true });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} fits at ${width}px`).toBe(true);
    }
  }
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('navigation').getByRole('link', { name: 'Track a parcel' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Track a parcel');
  await page.getByRole('link', { name: 'ParcelTrack Lite', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your parcels, in one place.');
  expect(errors).toEqual([]);
});

test('Airway themes persist across navigation and reload with locally served fonts', async ({ page, context }, testInfo) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith(testInfo.project.use.baseURL as string)) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('navigation').getByRole('link', { name: 'Track a parcel' }).click();
  await expect(page).toHaveURL(/\/track$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  expect((await context.cookies()).find(cookie => cookie.name === 'ptl_theme')?.value).toBe('dark');
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    expected: ['--font-barlow-condensed', '--font-dm-sans'].map(name => getComputedStyle(document.documentElement).getPropertyValue(name).split(',')[0].trim().replaceAll('"', '')),
    loaded: Array.from(document.fonts).filter(font => font.status === 'loaded').map(font => font.family.replaceAll('"', '')),
  }));
  expect(fonts.loaded).toEqual(expect.arrayContaining(fonts.expected));
  const sample = page.getByRole('button', { name: 'PTL-DEMO-001 Out for delivery', exact: true });
  await sample.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Tracking result' })).toBeFocused();
  await expect(page.locator('.docket-journey [aria-current="step"] h3')).toHaveText('Out for delivery');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('Airway layouts support both themes, long identifiers, enlarged text and reduced motion', async ({ page }, testInfo) => {
  for (const theme of ['light', 'dark']) {
    await page.context().addCookies([{ name: 'ptl_theme', value: theme, url: testInfo.project.use.baseURL as string }]);
    for (const route of ['/', '/track?number=PTL-DEMO-001', '/login']) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${theme} at ${width}px`).toBe(true);
      }
      await page.setViewportSize({ width: testInfo.project.name === 'phone' ? 390 : 1440, height: 1000 });
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${route.startsWith('/track') ? 'tracking' : route === '/' ? 'home' : 'login'}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/track?number=PTL-DEMO-001');
  await page.locator('.docket-identity h2').evaluate(element => { element.textContent = 'PTL-' + 'A'.repeat(32); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/api/v1/public/tracking', route => route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'The request could not be completed.' }, requestId: 'r' } }));
  await page.getByLabel('Tracking number', { exact: true }).fill('PTL-' + 'A'.repeat(32));
  await page.getByRole('button', { name: 'Track parcel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t find that parcel.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(page.url()).not.toContain('AAAA');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveCSS('transition-duration', '0s');
  await page.evaluate(() => {
    const text = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,p,a,button,input,label,span,time,legend,li')).map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize) }));
    for (const { element, size } of text) element.style.fontSize = `${size * 2}px`;
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
