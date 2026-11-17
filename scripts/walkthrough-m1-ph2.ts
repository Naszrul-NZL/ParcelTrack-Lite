import './env';
import { required } from './env';

// M1-PH2-T13 acceptance walkthrough. Runs real HTTP requests against a running app (test or development profile
// with seeded synthetic accounts) and prints one line per step. It never prints a password, token or cookie value.
const base = process.env.PTL_BASE_URL ?? 'http://localhost:3100';
const password = required('FIXTURE_PASSWORD');
const origin = new URL(base).origin;
let failures = 0;

type Jar = { cookie?: string };
type Body = { csrfToken?: string; role?: string; username?: string; error?: { code?: string } } & Record<string, unknown>;
function cookieOf(response: Response): string | undefined {
  return response.headers.getSetCookie().map(value => value.split(';')[0]).find(value => value.startsWith('ptl_session_dev='));
}
async function call(jar: Jar, method: string, path: string, options: { body?: unknown; csrf?: string; provenance?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (jar.cookie) headers.cookie = jar.cookie;
  if (method !== 'GET') {
    if (options.provenance !== false) headers.origin = origin;
    if (options.csrf) headers['x-csrf-token'] = options.csrf;
  }
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + '/api/v1' + path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), redirect: 'manual' });
  const next = cookieOf(response);
  if (next) jar.cookie = next;
  const text = await response.text();
  let json: Body | undefined; try { json = text ? JSON.parse(text) : undefined; } catch { /* non-JSON body */ }
  return { response, json, text };
}
function check(step: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}: ${detail}`);
}
async function signIn(username: string, pw = password) {
  const jar: Jar = {};
  const bootstrap = await call(jar, 'GET', '/auth/csrf');
  const login = await call(jar, 'POST', '/auth/login', { csrf: bootstrap.json?.csrfToken, body: { username, password: pw } });
  return { jar, bootstrap, login };
}

console.log(`M1-PH2 walkthrough against ${base}`);

// 1. Failed logins: SQL-injection string and a wrong password.
for (const [label, username, pw] of [['SQL-injection username', "' OR '1'='1", 'any-password-value'], ['wrong password', 'seller.a', password + '-wrong']] as const) {
  const { login, jar } = await signIn(username, pw);
  const me = await call(jar, 'GET', '/auth/me');
  check(`failed login (${label})`, login.response.status === 401 && login.json?.error?.code === 'AUTH_INVALID' && me.response.status === 401 && !/sql|syntax|select/i.test(login.text),
    `status ${login.response.status}, code ${login.json?.error?.code}, no SQL text, /auth/me afterwards ${me.response.status}`);
}

// 2. Successful login as each role, a refresh, then logout and reuse of the old cookie.
for (const [username, role] of [['seller.a', 'SELLER'], ['rider.a', 'RIDER'], ['admin', 'ADMIN']] as const) {
  const { jar, bootstrap, login } = await signIn(username);
  const setCookie = login.response.headers.getSetCookie().find(value => value.startsWith('ptl_session_dev=')) ?? '';
  check(`login as ${role}`, login.response.status === 200 && login.json?.role === role && !('password_hash' in (login.json ?? {})) && /HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie) && !/Domain=/i.test(setCookie) && jar.cookie !== undefined,
    `status ${login.response.status}, role ${login.json?.role}, cookie HttpOnly+SameSite=Lax, no Domain, cache-control ${login.response.headers.get('cache-control')}`);
  const before = bootstrap.response.headers.getSetCookie()[0]?.split(';')[0];
  check(`session rotated at login (${role})`, !!before && before !== jar.cookie, 'anonymous cookie differs from the signed-in cookie');
  const refresh = await call(jar, 'GET', '/auth/me');
  check(`refresh keeps the session (${role})`, refresh.response.status === 200 && refresh.json?.username === username, `/auth/me status ${refresh.response.status}`);
  const old = jar.cookie;
  const out = await call(jar, 'POST', '/auth/logout', { csrf: login.json?.csrfToken });
  const cleared = out.response.headers.get('set-cookie') ?? '';
  check(`logout (${role})`, out.response.status === 204 && /Max-Age=0/.test(cleared), `status ${out.response.status}, cookie expired`);
  const reuse = await call({ cookie: old }, 'GET', '/auth/me');
  check(`old cookie after logout (${role})`, reuse.response.status === 401, `/auth/me status ${reuse.response.status}`);
}

// 3. CSRF: login and logout without a valid token, with a foreign Origin, and with no provenance at all.
{
  const { jar, bootstrap } = await signIn('nobody.here');
  const body = { username: 'seller.a', password };
  const cases: [string, Awaited<ReturnType<typeof call>>][] = [
    ['no token', await call(jar, 'POST', '/auth/login', { body })],
    ['wrong token', await call(jar, 'POST', '/auth/login', { body, csrf: 'wrong' })],
    ['no Origin or Sec-Fetch-Site', await call(jar, 'POST', '/auth/login', { body, csrf: bootstrap.json?.csrfToken, provenance: false })],
  ];
  const foreign = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { cookie: jar.cookie!, origin: 'https://foreign.invalid', 'x-csrf-token': bootstrap.json?.csrfToken ?? '', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  cases.push(['foreign Origin', { response: foreign, json: await foreign.json() as Body, text: '' }]);
  for (const [label, result] of cases) check(`CSRF-less login (${label})`, result.response.status === 403 && result.json?.error?.code === 'CSRF_INVALID', `status ${result.response.status}, code ${result.json?.error?.code}`);
  const session = await signIn('seller.a');
  const noToken = await call(session.jar, 'POST', '/auth/logout');
  const stillIn = await call(session.jar, 'GET', '/auth/me');
  check('CSRF-less logout', noToken.response.status === 403 && stillIn.response.status === 200, `logout status ${noToken.response.status}, session still valid (${stillIn.response.status})`);
}

// 4. Throttling for one unknown username (so the seeded accounts are not locked out for 15 minutes).
{
  const statuses: number[] = [];
  let retryAfter: string | null = null;
  for (let i = 0; i < 6; i++) {
    const { login } = await signIn('throttle.probe', 'any-password-value');
    statuses.push(login.response.status);
    retryAfter = login.response.headers.get('retry-after') ?? retryAfter;
  }
  check('login throttling', statuses.slice(0, 5).every(status => status === 401) && statuses[5] === 429 && Number(retryAfter) > 0, `statuses ${statuses.join(',')}, Retry-After ${retryAfter}`);
}

// 5. Role boundary. The Admin API endpoints are PH3 work; the server-side role check is proven on a probe route
// (M1-PH2-TC08) and the Admin page denial in tests/e2e/auth.spec.ts.
{
  const { jar, login } = await signIn('seller.a');
  const admin = await call(jar, 'GET', '/admin/users');
  check('Seller opening an Admin API route', admin.response.status === 404 && login.response.status === 200, `status ${admin.response.status}: /admin/users is planned (A07, PH3), so there is no route to deny yet`);
}

console.log(failures ? `${failures} step(s) failed` : 'All walkthrough steps passed');
process.exit(failures ? 1 : 0);
