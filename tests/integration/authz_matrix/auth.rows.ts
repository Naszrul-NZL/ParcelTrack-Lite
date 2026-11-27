import { GET as health } from '@/app/api/v1/health/route';
import type { MatrixRow, Identity } from './matrix';

const everyone = (status: number, overrides: Partial<Record<Identity, number>> = {}): Record<Identity, number> => ({
  anonymous: status, 'seller.a': status, 'seller.b': status, 'rider.a': status, 'rider.b': status, admin: status, inactive: status, 'must.change': status, ...overrides,
});
const signedIn = (overrides: Partial<Record<Identity, number>> = {}) => everyone(200, { anonymous: 401, inactive: 401, ...overrides });

/** M1 rows: shared health plus A01 to A06. */
export const authRows: MatrixRow[] = [
  { endpoint: 'HEALTH', label: 'GET /health', expected: everyone(200), call: async actor => health(actor.request('/health')) },
  { endpoint: 'A01', label: 'GET /auth/csrf', expected: everyone(200), call: (actor, handlers) => handlers.csrf(actor.request('/auth/csrf')) },
  {
    // Public: any identity with a live session and its CSRF token may register another Seller. The inactive identity's
    // session is already dead, so its CSRF check fails first.
    endpoint: 'A02', label: 'POST /auth/register with a fresh username',
    expected: everyone(201, { inactive: 403 }),
    call: (actor, handlers) => handlers.register(actor.request('/auth/register', {
      method: 'POST', body: JSON.stringify({ username: 'new.' + actor.identity, displayName: 'Matrix ' + actor.identity, password: 'a-sufficiently-long-secret' }),
    })),
  },
  {
    // Every signed-in identity changes its own password (a must-change account included). The anonymous session has no
    // account and the inactive identity's session is already dead, so both are 401.
    endpoint: 'A06', label: 'POST /auth/password for the identity\'s own account',
    expected: everyone(204, { anonymous: 401, inactive: 401 }),
    call: (actor, handlers) => handlers.changePassword(actor.request('/auth/password', {
      method: 'POST', body: JSON.stringify({ currentPassword: actor.credentials.password, newPassword: 'a-different-long-secret' }),
    })),
  },
  {
    // The anonymous identity signs in with a wrong password. The inactive identity's session is already dead, so the
    // CSRF check on its stale cookie fails first. Everyone else signs in again and gets a rotated session.
    endpoint: 'A03', label: 'POST /auth/login with the identity\'s own credentials',
    expected: everyone(200, { anonymous: 401, inactive: 403 }),
    call: (actor, handlers) => handlers.login(actor.request('/auth/login', { method: 'POST', body: JSON.stringify(actor.credentials) })),
  },
  {
    endpoint: 'A04', label: 'POST /auth/logout',
    expected: everyone(204, { anonymous: 401, inactive: 401 }),
    call: (actor, handlers) => handlers.logout(actor.request('/auth/logout', { method: 'POST' })),
  },
  { endpoint: 'A05', label: 'GET /auth/me', expected: signedIn(), call: (actor, handlers) => handlers.me(actor.request('/auth/me')) },
];
