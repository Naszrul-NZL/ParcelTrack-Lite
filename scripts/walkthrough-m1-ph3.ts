import './env';
import { randomUUID } from 'node:crypto';
import { required } from './env';

// M1-PH3-T12 local production-build walking skeleton. Real HTTP requests against a running production build (test or
// development profile with seeded synthetic accounts), one line per step. It creates its own accounts and parcels, so it
// can be rerun. It never prints a password, token, tracking number or cookie value.
const base = process.env.PTL_BASE_URL ?? 'http://localhost:3100';
const password = required('FIXTURE_PASSWORD');
const origin = new URL(base).origin;
const suffix = Date.now().toString(36);
const NEW_PASSWORD = 'walkthrough-secret-' + suffix;
let failures = 0;

type Jar = { cookie?: string; csrf?: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const cookieOf = (response: Response) => response.headers.getSetCookie().map(value => value.split(';')[0]).find(value => value.startsWith('ptl_session_dev='));

async function call(jar: Jar, method: string, path: string, options: { body?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = {};
  if (jar.cookie) headers.cookie = jar.cookie;
  if (method !== 'GET') { headers.origin = origin; if (jar.csrf) headers['x-csrf-token'] = jar.csrf; }
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + '/api/v1' + path, { method, headers, body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)), redirect: 'manual' });
  const next = cookieOf(response);
  if (next) jar.cookie = next;
  const text = await response.text();
  let json: Json | undefined; try { json = text ? JSON.parse(text) : undefined; } catch { /* non-JSON body */ }
  return { response, status: response.status, json, text, code: json?.error?.code as string | undefined };
}
function check(step: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}: ${detail}`);
}
async function signIn(username: string, secret = password) {
  const jar: Jar = {};
  jar.csrf = (await call(jar, 'GET', '/auth/csrf')).json?.csrfToken;
  const login = await call(jar, 'POST', '/auth/login', { body: { username, password: secret } });
  if (login.status === 200) jar.csrf = login.json?.csrfToken;
  return { jar, login };
}

console.log(`M1-PH3 walking skeleton against ${base}`);

// 1. Liveness and browser-facing headers on a real page and on the API.
const health = await fetch(base + '/api/v1/health');
check('health', health.status === 200, `status ${health.status}, cache-control ${health.headers.get('cache-control')}`);
const page = await fetch(base + '/login');
check('page headers', page.status === 200 && page.headers.get('x-content-type-options') === 'nosniff' && page.headers.get('referrer-policy') === 'no-referrer',
  `status ${page.status}, nosniff ${page.headers.get('x-content-type-options')}, referrer-policy ${page.headers.get('referrer-policy')}, CSP ${page.headers.has('content-security-policy') || page.headers.has('content-security-policy-report-only') ? 'present' : 'absent'}`);

// 2. A visitor registers as a Seller: 201, no session cookie, role forced, then signs in.
const sellerName = 'wt.seller.' + suffix;
const visitor: Jar = {}; visitor.csrf = (await call(visitor, 'GET', '/auth/csrf')).json?.csrfToken;
const register = await call(visitor, 'POST', '/auth/register', { body: { username: sellerName, displayName: 'Walkthrough Seller', password: NEW_PASSWORD } });
check('register Seller (A02)', register.status === 201 && register.json?.role === 'SELLER' && register.response.headers.getSetCookie().every(value => !value.startsWith('ptl_session_dev=') || value === visitor.cookie), `status ${register.status}, role ${register.json?.role}, no new session issued`);
const elevated = await call(visitor, 'POST', '/auth/register', { body: { username: sellerName + '.x', displayName: 'Elevated', password: NEW_PASSWORD, role: 'ADMIN' } });
check('registration cannot choose a role', elevated.status === 422 && elevated.code === 'VALIDATION_ERROR', `status ${elevated.status}, code ${elevated.code}`);
const seller = await signIn(sellerName, NEW_PASSWORD);
const sellerCookie = seller.login.response.headers.getSetCookie().find(value => value.startsWith('ptl_session_dev=')) ?? '';
check('Seller signs in', seller.login.status === 200 && /HttpOnly/.test(sellerCookie) && /SameSite=Lax/.test(sellerCookie) && !/Domain=/i.test(sellerCookie), `status ${seller.login.status}, cookie HttpOnly + SameSite=Lax, no Domain`);

// 3. The Admin creates a Rider; the Rider is held on the password change until it is done.
const admin = await signIn('admin');
check('Admin signs in', admin.login.status === 200 && admin.login.json?.role === 'ADMIN', `status ${admin.login.status}`);
const riderName = 'wt.rider.' + suffix;
const created = await call(admin.jar, 'POST', '/admin/riders', { body: { username: riderName, displayName: 'Walkthrough Rider', initialPassword: NEW_PASSWORD } });
check('Admin creates a Rider (A08)', created.status === 201 && created.json?.role === 'RIDER' && created.json?.mustChangePassword === true && !created.text.includes(NEW_PASSWORD), `status ${created.status}, role ${created.json?.role}, must change ${created.json?.mustChangePassword}, password not echoed`);
const riderId: string = created.json?.id;
const rider = await signIn(riderName, NEW_PASSWORD);
const held = await call(rider.jar, 'GET', '/rider/parcels');
check('new Rider is held on the password change', rider.login.json?.mustChangePassword === true && held.status === 403 && held.code === 'PASSWORD_CHANGE_REQUIRED', `Rider list ${held.status} ${held.code}`);
const picker = await call(admin.jar, 'GET', '/admin/users?role=RIDER&isActive=true&pageSize=100');
check('Rider appears in the Admin picker (A07)', picker.status === 200 && picker.json?.items?.some((item: Json) => item.id === riderId), `status ${picker.status}`);
const changed = await call(rider.jar, 'POST', '/auth/password', { body: { currentPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD + '-2' } });
const stale = await call(rider.jar, 'GET', '/auth/me');
check('Rider changes the password (A06)', changed.status === 204 && stale.status === 401, `change ${changed.status}, old cookie afterwards ${stale.status}`);
const riderSession = await signIn(riderName, NEW_PASSWORD + '-2');
const ridersList = await call(riderSession.jar, 'GET', '/rider/parcels');
check('Rider works normally after the change', riderSession.login.json?.mustChangePassword === false && ridersList.status === 200, `sign-in ${riderSession.login.status}, list ${ridersList.status}`);

// 4. Seller registers a parcel (with a safe replay), Admin assigns, Rider starts the delivery.
const clientRequestId = randomUUID();
const parcelBody = { recipientName: 'Walkthrough Recipient', recipientPhone: '0123456789', recipientAddress: 'Synthetic address, Kuala Lumpur', weightKg: '1.25', clientRequestId };
const parcel = await call(seller.jar, 'POST', '/parcels', { body: parcelBody });
check('Seller registers a parcel (A10)', parcel.status === 201 && parcel.json?.currentStatus === 'REGISTERED', `status ${parcel.status}, ${parcel.json?.currentStatus}`);
const replay = await call(seller.jar, 'POST', '/parcels', { body: parcelBody });
check('replayed registration returns the same parcel', [200, 201].includes(replay.status) && replay.json?.id === parcel.json?.id, `status ${replay.status}, same id ${replay.json?.id === parcel.json?.id}`);
const parcelId: string = parcel.json?.id;
const sellerList = await call(seller.jar, 'GET', '/seller/parcels');
check('Seller sees it in the list (A11)', sellerList.status === 200 && sellerList.json?.items?.some((item: Json) => item.id === parcelId), `status ${sellerList.status}`);
const adminList = await call(admin.jar, 'GET', '/admin/parcels?status=REGISTERED&pageSize=100');
check('Admin sees it, unassigned (A14)', adminList.status === 200 && adminList.json?.items?.some((item: Json) => item.id === parcelId && item.assignedRider === null), `status ${adminList.status}`);
const assigned = await call(admin.jar, 'PATCH', `/admin/parcels/${parcelId}/assignment`, { body: { riderId, expectedVersion: parcel.json?.version } });
check('Admin assigns the Rider (A15)', assigned.status === 200 && assigned.json?.currentStatus === 'ASSIGNED' && assigned.json?.assignedRider?.id === riderId, `status ${assigned.status}, ${assigned.json?.currentStatus}`);
const mine = await call(riderSession.jar, 'GET', '/rider/parcels');
check('Rider sees the parcel (A16)', mine.status === 200 && mine.json?.items?.some((item: Json) => item.id === parcelId), `status ${mine.status}`);
const form = new FormData(); form.set('status', 'OUT_FOR_DELIVERY'); form.set('expectedVersion', String(assigned.json?.version));
const started = await call(riderSession.jar, 'POST', `/rider/parcels/${parcelId}/status`, { form });
check('Rider starts the delivery (A17)', started.status === 200 && started.json?.currentStatus === 'OUT_FOR_DELIVERY', `status ${started.status}, ${started.json?.currentStatus}`);
const detail = await call(seller.jar, 'GET', `/parcels/${parcelId}`);
check('Seller sees the new status (A12)', detail.status === 200 && detail.json?.currentStatus === 'OUT_FOR_DELIVERY', `status ${detail.status}, ${detail.json?.currentStatus}`);

// 5. Public tracking exposes only the contracted fields.
const anonymous: Jar = {}; anonymous.csrf = (await call(anonymous, 'GET', '/auth/csrf')).json?.csrfToken;
const tracked = await call(anonymous, 'POST', '/public/tracking', { body: { trackingNumber: parcel.json?.trackingNumber } });
const leaked = /recipient|address|phone|weight|rider|seller|proof|trackingNumber/i.test(tracked.text);
const events: Json[] = tracked.json?.history ?? [];
check('public tracking (A13)', tracked.status === 200 && Object.keys(tracked.json ?? {}).join() === 'history' && events.at(-1)?.status === 'OUT_FOR_DELIVERY' && events.every(event => Object.keys(event).sort().join() === 'changedAt,status') && !leaked,
  `status ${tracked.status}, ${events.length} recorded events ending ${events.at(-1)?.status}, only status and time per event, no recipient, contact, Rider or proof fields`);

// 6. Boundaries: a Seller cannot reach Admin or Rider data, and nobody reads another account's parcel.
for (const [label, method, path] of [['Admin users', 'GET', '/admin/users'], ['Admin parcels', 'GET', '/admin/parcels'], ['Rider list', 'GET', '/rider/parcels']] as const) {
  const denied = await call(seller.jar, method, path);
  check(`Seller denied: ${label}`, denied.status === 403, `status ${denied.status}`);
}
const other = await signIn('seller.b');
const foreign = await call(other.jar, 'GET', `/parcels/${parcelId}`);
check('another Seller cannot read the parcel', foreign.status === 404, `status ${foreign.status}`);
const otherRider = await signIn('rider.b');
const foreignStart = new FormData(); foreignStart.set('status', 'OUT_FOR_DELIVERY'); foreignStart.set('expectedVersion', '3');
const notMine = await call(otherRider.jar, 'POST', `/rider/parcels/${parcelId}/status`, { form: foreignStart });
check('another Rider cannot act on the parcel', notMine.status === 404, `status ${notMine.status}`);

// 7. Disabling the Rider ends their access at once and flags the parcel for reassignment; reactivation restores sign-in only.
const listed = (await call(admin.jar, 'GET', '/admin/users?role=RIDER&pageSize=100')).json?.items?.find((item: Json) => item.id === riderId);
const disabled = await call(admin.jar, 'PATCH', `/admin/users/${riderId}/status`, { body: { isActive: false, expectedVersion: listed?.version } });
const oldRider = await call(riderSession.jar, 'GET', '/rider/parcels');
const blockedLogin = await signIn(riderName, NEW_PASSWORD + '-2');
check('disabled Rider loses access at once (A09)', disabled.status === 200 && oldRider.status === 401 && blockedLogin.login.status === 401, `disable ${disabled.status}, old cookie ${oldRider.status}, new sign-in ${blockedLogin.login.status}`);
const needs = await call(admin.jar, 'GET', '/admin/parcels?needsReassignment=true&pageSize=100');
check('parcel flagged for reassignment (A14)', needs.status === 200 && needs.json?.items?.some((item: Json) => item.id === parcelId && item.assignedRider?.isActive === false), `status ${needs.status}`);
const enabled = await call(admin.jar, 'PATCH', `/admin/users/${riderId}/status`, { body: { isActive: true, expectedVersion: disabled.json?.version } });
check('reactivation allows a fresh sign-in only', enabled.status === 200 && (await call(riderSession.jar, 'GET', '/auth/me')).status === 401 && (await signIn(riderName, NEW_PASSWORD + '-2')).login.status === 200, `reactivate ${enabled.status}`);

// 8. Admin password reset ends the Seller's session and forces a change.
const sellerRow = (await call(admin.jar, 'GET', '/admin/users?role=SELLER&pageSize=100')).json?.items?.find((item: Json) => item.username === sellerName);
const reset = await call(admin.jar, 'POST', `/admin/users/${sellerRow?.id}/password-reset`);
const afterReset = await call(seller.jar, 'GET', '/seller/parcels');
const temporary: string | undefined = reset.json?.temporaryPassword;
const withTemporary = temporary ? await signIn(sellerName, temporary) : undefined;
check('Admin resets a password (A21)', reset.status === 200 && afterReset.status === 401 && withTemporary?.login.json?.mustChangePassword === true && !JSON.stringify(reset.response.headers).includes(temporary ?? '\0'), `reset ${reset.status}, old session ${afterReset.status}, temporary sign-in must change ${withTemporary?.login.json?.mustChangePassword}`);

// 9. Sign out ends the session; a stale cookie is useless.
const logout = await call(admin.jar, 'POST', '/auth/logout');
const reuse = await call({ cookie: admin.jar.cookie }, 'GET', '/auth/me');
check('sign out (A04)', logout.status === 204 && reuse.status === 401, `logout ${logout.status}, reused cookie ${reuse.status}`);

console.log(failures ? `\n${failures} step(s) failed` : '\nAll walking-skeleton steps passed');
process.exit(failures ? 1 : 0);
